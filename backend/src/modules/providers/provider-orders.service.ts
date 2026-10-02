import { UpdateProviderOrderCredentialDto } from './dto/update-provider-order-credential.dto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MembershipStatus, NotificationType, Prisma, ProviderOrderStatus, ProviderProfileStatus, Role, IncidentStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { ProviderOrderBuyerInfo } from './dto/provider-order-response.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { decrypt, encrypt } from '../../common/utils/crypto.util';
import { buildReceiptFilename, deleteReceiptFile, receiptMatchesType, resolveReceiptPath, saveReceiptFile } from '../../common/utils/receipt-storage.util';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { GroupsService } from '../groups/groups.service';
import { CommissionsService } from '../commissions/commissions.service';
import { WholesaleAccessService } from './wholesale-access.service';
import { CreateProviderOrderDto } from './dto/create-provider-order.dto';
import { DeliverProviderOrderCredentialDto } from './dto/deliver-provider-order-credential.dto';
import { ListProviderOrdersQueryDto } from './dto/list-provider-orders-query.dto';
import { ProviderOrderCredentialResponseDto } from './dto/provider-order-credential-response.dto';
import { CreateGroupFromProviderOrderDto } from './dto/create-group-from-provider-order.dto';
import {
  DAY_MS,
  EXPIRY_NOTICE_DAYS,
  HOUR_MS,
  PAYMENT_WINDOW_HOURS,
  RECEIPT_RETRY_WINDOW_HOURS,
  RENEWAL_WINDOW_DAYS,
} from './wholesale.constants';

const WITH_RELATIONS = {
  listing: {
    select: {
      id: true,
      plan: {
        select: {
          id: true,
          tierName: true,
          maxSlots: true,
          officialPrice: true,
          platform: { select: { id: true, name: true } },
        },
      },
      providerProfile: { select: { id: true, businessName: true } },
    },
  },
  renewals: { select: { id: true, status: true }, orderBy: { createdAt: 'desc' } },
  replacements: { select: { id: true, status: true }, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.ProviderOrderInclude;

const EXTENSION_BY_MIMETYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

/** Órdenes que todavía están en marcha (no terminaron ni se cancelaron). */
const OPEN_STATUSES: ProviderOrderStatus[] = [
  ProviderOrderStatus.AWAITING_PAYMENT,
  ProviderOrderStatus.PENDING_APPROVAL,
  ProviderOrderStatus.PENDING_DELIVERY,
];

/** Mientras el pago no se valida, la orden todavía se puede retirar y el stock se libera. */
const UNPAID_STATUSES: ProviderOrderStatus[] = [ProviderOrderStatus.AWAITING_PAYMENT, ProviderOrderStatus.PENDING_APPROVAL];

const ORDER_WITH_PARTIES = {
  listing: { include: { providerProfile: true, plan: { select: { tierName: true, platform: { select: { name: true } } } } } },
  buyer: { select: { id: true, name: true } },
} satisfies Prisma.ProviderOrderInclude;

/** Nombre de la cuenta en los avisos: "Prime Video · Premium", para distinguir compras del mismo plan de distintas plataformas. */
function accountName(plan: { tierName: string; platform?: { name: string } | null }): string {
  const tier = plan.tierName.replace(/\s+/g, ' ').trim();
  return plan.platform ? `${plan.platform.name} · ${tier}` : tier;
}

/**
 * Datos cifrados de una entrega de mayoreo. Con credenciales se piden correo y contraseña; por panel, el link (y el
 * usuario y la contraseña del panel son opcionales).
 */
function deliveryData(dto: DeliverProviderOrderCredentialDto, key: string) {
  const panelUrl = dto.panelUrl?.trim();
  if (!panelUrl && (!dto.username || !dto.password)) {
    throw new BadRequestException('Escribe el correo y la contraseña de la cuenta, o el link del panel.');
  }
  return {
    usernameEncrypted: dto.username ? encrypt(dto.username, key) : null,
    passwordEncrypted: dto.password ? encrypt(dto.password, key) : null,
    panelUrlEncrypted: panelUrl ? encrypt(panelUrl, key) : null,
    notesEncrypted: dto.notes ? encrypt(dto.notes, key) : null,
  };
}

/** Lo que se copia al grupo del vendedor: solo una entrega con credenciales (por panel, el acceso lo da el vendedor). */
function groupCopy(data: ReturnType<typeof deliveryData>) {
  if (data.panelUrlEncrypted || !data.usernameEncrypted || !data.passwordEncrypted) return null;
  return { usernameEncrypted: data.usernameEncrypted, passwordEncrypted: data.passwordEncrypted, notesEncrypted: data.notesEncrypted };
}

@Injectable()
export class ProviderOrdersService {
  private readonly logger = new Logger(ProviderOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly groupsService: GroupsService,
    private readonly commissionsService: CommissionsService,
    private readonly wholesaleAccessService: WholesaleAccessService,
    private readonly mailService: MailService,
  ) {}

  private get receiptsDir(): string {
    return this.configService.get<string>('receipts.dir')!;
  }

  private dateLabel(date: Date): string {
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });
  }

  /** Sin la cuenta de Tequio publicada no hay a dónde pagar: no se abre ninguna compra. */
  private async assertPaymentAccount(): Promise<void> {
    if (!(await this.commissionsService.getBankAccount())) {
      throw new BadRequestException('El mayoreo todavía no está disponible: Tequio no ha publicado su cuenta para recibir el pago.');
    }
  }

  // ------------------------------------------------------------------ crear

  /**
   * El vendedor RESERVA una cuenta: el stock se aparta de inmediato y tiene un plazo para
   * transferir y subir su comprobante (si no lo hace, la reserva se cancela sola). Solo compra
   * quien tiene acceso al mayoreo autorizado.
   */
  async create(buyerUserId: string, dto: CreateProviderOrderDto) {
    await this.commissionsService.assertNotRestricted(buyerUserId, 'comprar cuentas al mayoreo');
    await this.assertPaymentAccount();
    await this.wholesaleAccessService.assertCanPurchase(buyerUserId, { countsForCap: true });

    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.providerListing.findUnique({
        where: { id: dto.listingId },
        include: { providerProfile: true, plan: { select: { tierName: true, platform: { select: { name: true } } } } },
      });
      if (!listing) {
        throw new NotFoundException('Servicio de proveedor no encontrado.');
      }
      if (!listing.active || listing.providerProfile.status !== ProviderProfileStatus.APPROVED) {
        throw new BadRequestException('Este servicio ya no está disponible.');
      }
      if (listing.providerProfile.userId === buyerUserId) {
        throw new BadRequestException('No puedes comprar tu propio servicio.');
      }
      const buyerRole = (await tx.user.findUnique({ where: { id: buyerUserId }, select: { role: true } }))?.role;
      if (buyerRole === Role.ADMIN) {
        throw new BadRequestException('Los administradores gestionan la tienda desde Admin > Mi tienda; para probar una compra usa una cuenta de usuario.');
      }
      if (listing.stockQuantity < 1) {
        throw new BadRequestException('Este servicio no tiene stock disponible ahora mismo.');
      }
      const inProgress = await tx.providerOrder.findFirst({
        where: { buyerUserId, listingId: listing.id, renewsOrderId: null, replacesOrderId: null, status: { in: UNPAID_STATUSES } },
        select: { id: true },
      });
      if (inProgress) {
        throw new ConflictException('Ya tienes una compra de esta cuenta esperando pago. Termínala o retírala primero.');
      }

      await tx.providerListing.update({ where: { id: listing.id }, data: { stockQuantity: { decrement: 1 } } });
      const order = await this.createPendingOrder(tx, { listing, buyerUserId, validityDays: listing.validityDays, renewable: listing.renewable });

      await this.notificationsService.create(tx, {
        userId: listing.providerProfile.userId,
        type: NotificationType.PROVIDER_ORDER_PLACED,
        payload: `Un vendedor reservó "${accountName(listing.plan)}" por $${Number(listing.wholesalePrice).toFixed(2)}. Tiene ${PAYMENT_WINDOW_HOURS} horas para transferir y subir su comprobante.`,
      });
      return order;
    });
  }

  private createPendingOrder(
    tx: Prisma.TransactionClient,
    params: {
      listing: { id: string; wholesalePrice: Prisma.Decimal };
      buyerUserId: string;
      validityDays: number;
      renewable: boolean;
      renewsOrderId?: string;
      replacesOrderId?: string;
    },
  ) {
    return tx.providerOrder.create({
      data: {
        listingId: params.listing.id,
        buyerUserId: params.buyerUserId,
        unitPrice: params.listing.wholesalePrice,
        status: ProviderOrderStatus.AWAITING_PAYMENT,
        renewable: params.renewable,
        validityDays: params.validityDays,
        paymentDueAt: new Date(Date.now() + PAYMENT_WINDOW_HOURS * HOUR_MS),
        renewsOrderId: params.renewsOrderId,
        replacesOrderId: params.replacesOrderId,
      },
      include: WITH_RELATIONS,
    });
  }

  // ------------------------------------------------------------------ renovación y reposición

  private async loadOwnFulfilledOrder(orderId: string, buyerUserId: string) {
    const order = await this.prisma.providerOrder.findUnique({
      where: { id: orderId },
      include: { listing: { include: { providerProfile: true, plan: { select: { tierName: true, platform: { select: { name: true } } } } } }, renewals: { select: { status: true } }, replacements: { select: { status: true } } },
    });
    if (!order || order.buyerUserId !== buyerUserId) {
      throw new NotFoundException('Compra no encontrada.');
    }
    if (order.status !== ProviderOrderStatus.FULFILLED || order.renewsOrderId) {
      throw new BadRequestException('Solo se puede renovar o reponer una cuenta que ya te entregaron.');
    }
    if (order.replacements.some((r) => r.status === ProviderOrderStatus.FULFILLED)) {
      throw new BadRequestException('Esta cuenta ya fue repuesta: usa la más reciente.');
    }
    return order;
  }

  private assertWithinRenewalWindow(expiresAt: Date | null): void {
    if (expiresAt && expiresAt.getTime() - Date.now() > RENEWAL_WINDOW_DAYS * DAY_MS) {
      throw new BadRequestException(`Todavía es pronto: podrás hacerlo ${RENEWAL_WINDOW_DAYS} días antes de que venza (el ${this.dateLabel(expiresAt)}).`);
    }
  }

  /** Renovar una cuenta renovable: mismo flujo de pago; al validarse se alarga su vigencia. No consume stock. */
  async renew(orderId: string, buyerUserId: string) {
    const order = await this.loadOwnFulfilledOrder(orderId, buyerUserId);
    if (!order.renewable) {
      throw new BadRequestException('Esta cuenta no es renovable: cuando venza compra su reposición.');
    }
    if (order.renewals.some((r) => OPEN_STATUSES.includes(r.status))) {
      throw new ConflictException('Ya tienes una renovación en curso de esta cuenta.');
    }
    this.assertWithinRenewalWindow(order.expiresAt);
    await this.commissionsService.assertNotRestricted(buyerUserId, 'renovar cuentas al mayoreo');
    await this.assertPaymentAccount();
    await this.wholesaleAccessService.assertCanPurchase(buyerUserId, { countsForCap: false });

    return this.prisma.$transaction(async (tx) => {
      const renewal = await this.createPendingOrder(tx, {
        listing: order.listing,
        buyerUserId,
        validityDays: order.validityDays,
        renewable: true,
        renewsOrderId: order.id,
      });
      await this.notificationsService.create(tx, {
        userId: order.listing.providerProfile.userId,
        type: NotificationType.PROVIDER_ORDER_PLACED,
        payload: `Un vendedor va a renovar "${accountName(order.listing.plan)}" por $${Number(order.listing.wholesalePrice).toFixed(2)}. Tiene ${PAYMENT_WINDOW_HOURS} horas para pagar.`,
      });
      return renewal;
    });
  }

  /** Reponer una cuenta no renovable que venció (o está por vencer): una compra nueva que, al entregarse, sustituye la credencial de su grupo. */
  async replace(orderId: string, buyerUserId: string) {
    const order = await this.loadOwnFulfilledOrder(orderId, buyerUserId);
    if (order.renewable) {
      throw new BadRequestException('Esta cuenta es renovable: renuévala en lugar de comprar otra.');
    }
    if (order.replacements.some((r) => OPEN_STATUSES.includes(r.status))) {
      throw new ConflictException('Ya tienes una reposición en curso de esta cuenta.');
    }
    this.assertWithinRenewalWindow(order.expiresAt);
    await this.commissionsService.assertNotRestricted(buyerUserId, 'comprar cuentas al mayoreo');
    await this.assertPaymentAccount();
    await this.wholesaleAccessService.assertCanPurchase(buyerUserId, { countsForCap: false });

    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.providerListing.findUniqueOrThrow({ where: { id: order.listingId }, include: { providerProfile: true, plan: { select: { tierName: true, platform: { select: { name: true } } } } } });
      if (!listing.active || listing.stockQuantity < 1) {
        throw new BadRequestException('Por ahora no hay cuentas de reposición disponibles. Inténtalo más tarde.');
      }
      await tx.providerListing.update({ where: { id: listing.id }, data: { stockQuantity: { decrement: 1 } } });
      const replacement = await this.createPendingOrder(tx, {
        listing,
        buyerUserId,
        validityDays: listing.validityDays,
        renewable: false,
        replacesOrderId: order.id,
      });
      await this.notificationsService.create(tx, {
        userId: listing.providerProfile.userId,
        type: NotificationType.PROVIDER_ORDER_PLACED,
        payload: `Un vendedor pidió la reposición de "${accountName(listing.plan)}" por $${Number(listing.wholesalePrice).toFixed(2)}. Tiene ${PAYMENT_WINDOW_HOURS} horas para pagar.`,
      });
      return replacement;
    });
  }

  // ------------------------------------------------------------------ consultas

  async findMine(buyerUserId: string, query: ListProviderOrdersQueryDto) {
    const where: Prisma.ProviderOrderWhereInput = { buyerUserId, status: query.status };
    const [data, total] = await Promise.all([
      this.prisma.providerOrder.findMany({
        where,
        include: WITH_RELATIONS,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.providerOrder.count({ where }),
    ]);
    return { data, total };
  }

  async findAsProvider(providerUserId: string, query: ListProviderOrdersQueryDto) {
    const profile = await this.prisma.providerProfile.findUnique({ where: { userId: providerUserId } });
    if (!profile) {
      throw new NotFoundException('Todavía no tienes un perfil de proveedor.');
    }

    const where: Prisma.ProviderOrderWhereInput = {
      status: query.status,
      listing: { providerProfileId: profile.id },
    };
    const [data, total] = await Promise.all([
      this.prisma.providerOrder.findMany({
        where,
        include: WITH_RELATIONS,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.providerOrder.count({ where }),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    const order = await this.prisma.providerOrder.findUnique({ where: { id }, include: WITH_RELATIONS });
    if (!order) {
      throw new NotFoundException('Orden no encontrada.');
    }
    return order;
  }

  /**
   * Detalle de una orden para quien tiene derecho a verla: el comprador, el proveedor que la
   * vende o un ADMIN. El proveedor/ADMIN además recibe la ficha del comprador para decidir
   * si aprueba; el comprador nunca recibe datos de otros usuarios.
   */
  async findByIdForUser(id: string, user: AuthenticatedUser): Promise<{ order: Awaited<ReturnType<ProviderOrdersService['findById']>>; buyer?: ProviderOrderBuyerInfo }> {
    const order = await this.findById(id);
    const full = await this.prisma.providerOrder.findUniqueOrThrow({
      where: { id },
      include: { listing: { select: { providerProfile: { select: { userId: true } } } } },
    });
    const isBuyer = full.buyerUserId === user.id;
    const isProvider = full.listing.providerProfile.userId === user.id;
    if (!isBuyer && !isProvider && user.role !== Role.ADMIN) {
      throw new ForbiddenException('No tienes acceso a esta orden.');
    }
    if (isBuyer && !isProvider) {
      return { order };
    }

    const [buyer, ownedGroups, completedPurchases, access] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: full.buyerUserId },
        select: { id: true, name: true, email: true, createdAt: true, emailVerified: true },
      }),
      this.prisma.group.count({ where: { ownerId: full.buyerUserId } }),
      this.prisma.providerOrder.count({ where: { buyerUserId: full.buyerUserId, status: ProviderOrderStatus.FULFILLED } }),
      this.wholesaleAccessService.getMine(full.buyerUserId),
    ]);
    return {
      order,
      buyer: {
        id: buyer.id,
        name: buyer.name,
        email: buyer.email,
        memberSince: buyer.createdAt,
        emailVerified: buyer.emailVerified,
        ownedGroups,
        completedPurchases,
        wholesale: { status: access.status, monthlyCap: access.monthlyCap, usedThisMonth: access.usedThisMonth, metCount: access.metCount, total: access.total },
      },
    };
  }

  private async assertIsProviderOfOrder(orderId: string, userId: string) {
    const order = await this.prisma.providerOrder.findUnique({ where: { id: orderId }, include: ORDER_WITH_PARTIES });
    if (!order) {
      throw new NotFoundException('Orden no encontrada.');
    }
    if (order.listing.providerProfile.userId !== userId) {
      throw new ForbiddenException('Solo el proveedor que vendió esta orden puede hacer esto.');
    }
    return order;
  }

  // ------------------------------------------------------------------ pago por transferencia

  /** El comprador sube su comprobante (captura o PDF); queda esperando que el proveedor valide que el dinero llegó. */
  async uploadReceipt(orderId: string, buyerUserId: string, file: Express.Multer.File) {
    const extension = EXTENSION_BY_MIMETYPE[file.mimetype];
    if (!extension) {
      throw new BadRequestException('Solo se aceptan comprobantes en JPG, PNG, WEBP o PDF.');
    }
    if (!receiptMatchesType(file.buffer, file.mimetype)) {
      throw new BadRequestException('El archivo no parece una imagen o un PDF válido. Sube la captura o el PDF original de tu transferencia.');
    }
    const order = await this.prisma.providerOrder.findUnique({ where: { id: orderId }, include: ORDER_WITH_PARTIES });
    if (!order || order.buyerUserId !== buyerUserId) {
      throw new NotFoundException('Compra no encontrada.');
    }
    if (!UNPAID_STATUSES.includes(order.status)) {
      throw new BadRequestException('Esta compra ya no acepta comprobantes.');
    }
    if (order.status === ProviderOrderStatus.AWAITING_PAYMENT && order.paymentDueAt && order.paymentDueAt.getTime() < Date.now()) {
      throw new BadRequestException('El plazo para pagar esta reserva ya venció. Vuelve a reservar la cuenta.');
    }

    const filename = buildReceiptFilename(order.buyer.name, `${order.listing.plan.platform.name}-mayoreo`, new Date(), extension);
    await saveReceiptFile(this.receiptsDir, filename, file.buffer);

    try {
      await this.prisma.$transaction(async (tx) => {
        // El where con status protege de una segunda petición que ya cambió la orden.
        const result = await tx.providerOrder.updateMany({
          where: { id: orderId, status: { in: UNPAID_STATUSES } },
          data: { status: ProviderOrderStatus.PENDING_APPROVAL, receiptPath: filename, receiptUploadedAt: new Date(), receiptRejectionReason: null },
        });
        if (result.count === 0) {
          throw new BadRequestException('Esta compra ya no acepta comprobantes.');
        }
        await this.notificationsService.create(tx, {
          userId: order.listing.providerProfile.userId,
          type: NotificationType.PROVIDER_ORDER_RECEIPT_UPLOADED,
          payload: `${order.buyer.name} subió el comprobante de "${accountName(order.listing.plan)}" por $${Number(order.unitPrice).toFixed(2)}. Confirma en tu banco que llegó y aprueba el pago.`,
        });
      });
    } catch (error) {
      await deleteReceiptFile(this.receiptsDir, filename);
      throw error;
    }
    if (order.receiptPath) {
      await deleteReceiptFile(this.receiptsDir, order.receiptPath);
    }
    return this.findById(orderId);
  }

  async getReceiptFilePath(orderId: string, requester: AuthenticatedUser): Promise<{ absolutePath: string; filename: string }> {
    const order = await this.prisma.providerOrder.findUnique({ where: { id: orderId }, include: ORDER_WITH_PARTIES });
    if (!order) {
      throw new NotFoundException('Orden no encontrada.');
    }
    const isBuyer = order.buyerUserId === requester.id;
    const isProvider = order.listing.providerProfile.userId === requester.id;
    if (!isBuyer && !isProvider && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('No tienes acceso a este comprobante.');
    }
    if (!order.receiptPath) {
      throw new NotFoundException('Esta compra todavía no tiene comprobante.');
    }
    return { absolutePath: resolveReceiptPath(this.receiptsDir, order.receiptPath), filename: order.receiptPath };
  }

  /**
   * El proveedor confirma que el dinero llegó a su banco. Una compra pasa a esperar la entrega
   * de la cuenta; una renovación se resuelve aquí mismo alargando la vigencia de la cuenta original.
   */
  async approve(orderId: string, providerUserId: string) {
    const order = await this.assertIsProviderOfOrder(orderId, providerUserId);
    if (order.status !== ProviderOrderStatus.PENDING_APPROVAL || !order.receiptPath) {
      throw new BadRequestException(
        order.status === ProviderOrderStatus.AWAITING_PAYMENT
          ? 'El comprador todavía no sube su comprobante.'
          : `Esta orden ya está en estado ${order.status}, no hay ningún pago por validar.`,
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (order.renewsOrderId) {
        const parent = await tx.providerOrder.findUniqueOrThrow({ where: { id: order.renewsOrderId } });
        const base = parent.expiresAt && parent.expiresAt.getTime() > now.getTime() ? parent.expiresAt : now;
        const newExpiry = new Date(base.getTime() + order.validityDays * DAY_MS);
        await tx.providerOrder.update({ where: { id: parent.id }, data: { expiresAt: newExpiry, expiryNoticeStage: 0 } });
        const result = await tx.providerOrder.updateMany({
          where: { id: orderId, status: ProviderOrderStatus.PENDING_APPROVAL },
          data: { status: ProviderOrderStatus.FULFILLED, paidAt: now, expiresAt: newExpiry },
        });
        if (result.count === 0) throw new BadRequestException('Esta orden ya fue revisada por otra solicitud.');
        await this.notificationsService.create(tx, {
          userId: order.buyerUserId,
          type: NotificationType.PROVIDER_ORDER_APPROVED,
          payload: `Validamos tu pago: "${accountName(order.listing.plan)}" queda vigente hasta el ${this.dateLabel(newExpiry)}.`,
        });
        return;
      }

      const result = await tx.providerOrder.updateMany({
        where: { id: orderId, status: ProviderOrderStatus.PENDING_APPROVAL },
        data: { status: ProviderOrderStatus.PENDING_DELIVERY, paidAt: now },
      });
      if (result.count === 0) throw new BadRequestException('Esta orden ya fue revisada por otra solicitud.');
      await this.notificationsService.create(tx, {
        userId: order.buyerUserId,
        type: NotificationType.PROVIDER_ORDER_APPROVED,
        payload: `Validamos tu pago de $${Number(order.unitPrice).toFixed(2)} por "${accountName(order.listing.plan)}". El proveedor entregará las credenciales pronto.`,
      });
    });

    return this.findById(orderId);
  }

  /** El comprobante no sirve (monto distinto, ilegible…): vuelve a esperar pago para que suba otro. */
  async rejectReceipt(orderId: string, providerUserId: string, reason?: string) {
    const order = await this.assertIsProviderOfOrder(orderId, providerUserId);
    if (order.status !== ProviderOrderStatus.PENDING_APPROVAL || !order.receiptPath) {
      throw new BadRequestException('Esta orden no tiene un comprobante esperando revisión.');
    }

    const retryUntil = new Date(Date.now() + RECEIPT_RETRY_WINDOW_HOURS * HOUR_MS);
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.providerOrder.updateMany({
        where: { id: orderId, status: ProviderOrderStatus.PENDING_APPROVAL },
        data: {
          status: ProviderOrderStatus.AWAITING_PAYMENT,
          receiptPath: null,
          receiptUploadedAt: null,
          receiptRejectionReason: reason?.trim() || 'El comprobante no pudo validarse.',
          paymentDueAt: order.paymentDueAt && order.paymentDueAt > retryUntil ? order.paymentDueAt : retryUntil,
        },
      });
      if (result.count === 0) throw new BadRequestException('Esta orden ya fue revisada por otra solicitud.');
      await this.notificationsService.create(tx, {
        userId: order.buyerUserId,
        type: NotificationType.PROVIDER_ORDER_RECEIPT_REJECTED,
        payload: `Rechazamos tu comprobante de "${accountName(order.listing.plan)}"${reason ? `: ${reason}` : '.'} Sube uno nuevo antes del ${this.dateLabel(retryUntil)}.`,
      });
    });
    await deleteReceiptFile(this.receiptsDir, order.receiptPath);

    return this.findById(orderId);
  }

  /** El proveedor rechaza la solicitud completa — el stock se libera y se descarta el comprobante si lo había. */
  async reject(orderId: string, providerUserId: string, reason?: string) {
    const order = await this.assertIsProviderOfOrder(orderId, providerUserId);
    if (!UNPAID_STATUSES.includes(order.status)) {
      throw new BadRequestException(`Esta orden ya está en estado ${order.status}, no hay nada pendiente por rechazar.`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.providerOrder.update({
        where: { id: orderId },
        data: { status: ProviderOrderStatus.REJECTED, cancelledAt: new Date(), receiptPath: null },
      });
      await this.releaseStock(tx, order);
      await this.notificationsService.create(tx, {
        userId: order.buyerUserId,
        type: NotificationType.PROVIDER_ORDER_REJECTED,
        payload: reason
          ? `Tu solicitud de compra de "${accountName(order.listing.plan)}" fue rechazada: ${reason}`
          : `Tu solicitud de compra de "${accountName(order.listing.plan)}" fue rechazada por el proveedor.`,
      });
    });
    if (order.receiptPath) await deleteReceiptFile(this.receiptsDir, order.receiptPath);

    return this.findById(orderId);
  }

  /** Solo las compras (y reposiciones) apartan una cuenta del inventario; una renovación no. */
  private async releaseStock(tx: Prisma.TransactionClient, order: { listingId: string; renewsOrderId: string | null }) {
    if (order.renewsOrderId) return;
    await tx.providerListing.update({ where: { id: order.listingId }, data: { stockQuantity: { increment: 1 } } });
  }

  // ------------------------------------------------------------------ entrega

  /** Solo el proveedor que vendió la orden puede entregar las credenciales — un paso aparte, igual que Group/Credential. */
  async deliverCredential(orderId: string, dto: DeliverProviderOrderCredentialDto, providerUserId: string) {
    const order = await this.assertIsProviderOfOrder(orderId, providerUserId);
    if (order.status !== ProviderOrderStatus.PENDING_DELIVERY) {
      throw new BadRequestException(`Esta orden ya está en estado ${order.status}, no se puede entregar de nuevo.`);
    }

    const key = this.configService.get<string>('credentialsEncryptionKey')!;
    const data = deliveryData(dto, key);
    const copy = groupCopy(data);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.providerOrderCredential.create({ data: { orderId, ...data } });
      await tx.providerOrder.update({
        where: { id: orderId },
        data: { status: ProviderOrderStatus.FULFILLED, expiresAt: new Date(now.getTime() + order.validityDays * DAY_MS), expiryNoticeStage: 0 },
      });

      // Una reposición sustituye la credencial del grupo que ya funcionaba con la cuenta vencida.
      let swappedInto: string | null = null;
      if (order.replacesOrderId) {
        const previous = await tx.providerOrder.findUnique({ where: { id: order.replacesOrderId } });
        if (previous?.resultingGroupId && copy) {
          const groupId = previous.resultingGroupId;
          await tx.credential.upsert({ where: { groupId }, create: { groupId, ...copy }, update: copy });
          await tx.credentialHistory.create({
            data: { groupId, changedByUserId: order.buyerUserId, changeReason: 'Reposición de la cuenta de mayoreo' },
          });
          await tx.providerOrder.update({ where: { id: previous.id }, data: { resultingGroupId: null } });
          await tx.providerOrder.update({ where: { id: orderId }, data: { resultingGroupId: groupId } });
          swappedInto = groupId;
        }
      }

      await this.notificationsService.create(tx, {
        userId: order.buyerUserId,
        type: NotificationType.PROVIDER_ORDER_DELIVERED,
        payload: swappedInto
          ? `Entregamos la reposición de "${accountName(order.listing.plan)}" y ya actualizamos las credenciales de tu grupo.`
          : `Ya tienes las credenciales de "${accountName(order.listing.plan)}" — revísalas en tu compra.`,
      });
      if (swappedInto) {
        const members = await tx.groupMembership.findMany({ where: { groupId: swappedInto, status: MembershipStatus.ACTIVE }, select: { userId: true } });
        for (const member of members) {
          await this.notificationsService.create(tx, {
            userId: member.userId,
            type: NotificationType.CREDENTIAL_UPDATED,
            payload: 'El vendedor renovó las credenciales de la cuenta. Ya puedes ver las nuevas en el detalle del grupo.',
            groupId: swappedInto,
          });
        }
      }
    });

    return this.findById(orderId);
  }

  /** La credencial descifrada: la ve el comprador (es su compra) y el proveedor que la vendió (la administra). */
  async getCredential(orderId: string, requester: { id: string }): Promise<ProviderOrderCredentialResponseDto> {
    const order = await this.prisma.providerOrder.findUnique({ where: { id: orderId }, include: { listing: { select: { providerProfile: { select: { userId: true } } } } } });
    if (!order) {
      throw new NotFoundException('Orden no encontrada.');
    }
    // El comprador la usa; el proveedor que la vendió la administra (para corregirla desde su tienda).
    if (order.buyerUserId !== requester.id && order.listing.providerProfile.userId !== requester.id) {
      throw new ForbiddenException('Solo el comprador o el proveedor de esta orden pueden ver la credencial.');
    }

    const credential = await this.prisma.providerOrderCredential.findUnique({ where: { orderId } });
    if (!credential) {
      throw new NotFoundException('El proveedor todavía no ha entregado las credenciales de esta orden.');
    }

    const key = this.configService.get<string>('credentialsEncryptionKey')!;
    const plain = (value: string | null) => (value ? decrypt(value, key) : null);
    return new ProviderOrderCredentialResponseDto({
      username: plain(credential.usernameEncrypted),
      password: plain(credential.passwordEncrypted),
      panelUrl: plain(credential.panelUrlEncrypted),
      notes: plain(credential.notesEncrypted),
      deliveredAt: credential.deliveredAt,
    });
  }

  /**
   * Tequio (dueño de las credenciales de sus cuentas de mayoreo) las corrige o las cambia. Se le avisa al vendedor;
   * si ya la publicó como grupo, también cambia la contraseña del grupo y se les avisa a sus miembros; y si el
   * vendedor tiene un reporte abierto de esa cuenta, se le escribe ahí para que confirme que ya quedó.
   */
  async updateCredential(orderId: string, dto: UpdateProviderOrderCredentialDto, providerUserId: string) {
    const order = await this.assertIsProviderOfOrder(orderId, providerUserId);
    if (order.status !== ProviderOrderStatus.FULFILLED || order.renewsOrderId) {
      throw new BadRequestException('Solo se pueden actualizar las credenciales de una cuenta ya entregada.');
    }
    const replacement = await this.prisma.providerOrder.findFirst({ where: { replacesOrderId: orderId, status: ProviderOrderStatus.FULFILLED }, select: { id: true } });
    if (replacement) {
      throw new BadRequestException('Esta cuenta ya fue sustituida por una reposición: actualiza las credenciales de la cuenta nueva.');
    }

    const key = this.configService.get<string>('credentialsEncryptionKey')!;
    const data = deliveryData(dto, key);
    const copy = groupCopy(data);
    const name = accountName(order.listing.plan);
    const reason = dto.changeReason?.trim();
    // Por panel el acceso del grupo lo administra el vendedor: no se toca su contraseña.
    const groupId = copy ? order.resultingGroupId : null;

    // Quienes reportaron algo de esta cuenta: además del aviso en la app, reciben la respuesta por correo.
    const answered: { id: string; subject: string; email: string }[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.providerOrderCredential.upsert({ where: { orderId }, create: { orderId, ...data }, update: data });

      if (groupId && copy) {
        await tx.credential.upsert({ where: { groupId }, create: { groupId, ...copy }, update: copy });
        await tx.credentialHistory.create({
          data: { groupId, changedByUserId: providerUserId, changeReason: reason ? `Tequio: ${reason}` : 'Tequio actualizó las credenciales de la cuenta de mayoreo' },
        });
        const members = await tx.groupMembership.findMany({
          where: { groupId, status: { in: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED] } },
          select: { userId: true },
        });
        for (const member of members) {
          await this.notificationsService.create(tx, {
            userId: member.userId,
            type: NotificationType.CREDENTIAL_UPDATED,
            groupId,
            payload: `Se actualizó el acceso de tu cuenta de ${order.listing.plan.platform?.name ?? 'tu grupo'}${reason ? ` (${reason})` : ''}. Entra a tu grupo para ver la contraseña nueva.`,
          });
        }
      }

      await this.notificationsService.create(tx, {
        userId: order.buyerUserId,
        type: NotificationType.CREDENTIAL_UPDATED,
        ...(groupId ? { groupId } : {}),
        payload: `Tequio actualizó las credenciales de tu cuenta "${name}"${reason ? ` (${reason})` : ''}. ${groupId ? 'Ya las cambiamos también en tu grupo y les avisamos a tus miembros.' : 'Revísalas en Mayoreo → Mis compras.'}`,
      });

      // Reportes abiertos de esta cuenta (del vendedor) o de su grupo (de un miembro): se deja la respuesta en la
      // conversación para que quien reportó confirme que ya quedó.
      const openIncidents = await tx.incident.findMany({
        where: {
          status: { in: [IncidentStatus.OPEN, IncidentStatus.IN_REVIEW, IncidentStatus.ESCALATED] },
          OR: [{ providerOrderId: orderId }, ...(groupId ? [{ groupMembership: { groupId } }] : [])],
        },
        select: { id: true, status: true, subject: true, reportedByUserId: true, providerOrderId: true, reportedBy: { select: { email: true } } },
      });
      for (const incident of openIncidents) {
        const aboutOrder = incident.providerOrderId === orderId;
        await tx.incidentMessage.create({
          data: {
            incidentId: incident.id,
            authorUserId: providerUserId,
            body: aboutOrder
              ? `Actualizamos las credenciales de esta cuenta${reason ? ` (${reason})` : ''}. Revísalas en Mayoreo → Mis compras${groupId ? ' (tu grupo ya tiene las nuevas)' : ''} y, si ya funcionan, cierra el reporte con "Ya quedó".`
              : `Tequio actualizó la contraseña de esta cuenta${reason ? ` (${reason})` : ''}. Revisa el acceso en tu grupo y, si ya funciona, cierra el reporte con "Ya quedó".`,
          },
        });
        await tx.incident.update({
          where: { id: incident.id },
          data: { lastAssigneeReplyAt: new Date(), responseDueAt: null, ...(incident.status === IncidentStatus.OPEN ? { status: IncidentStatus.IN_REVIEW } : {}) },
        });
        await this.notificationsService.create(tx, {
          userId: incident.reportedByUserId,
          type: NotificationType.INCIDENT_MESSAGE,
          payload: `Tequio respondió tu reporte "${incident.subject}": ya actualizó las credenciales.`,
        });
        answered.push({ id: incident.id, subject: incident.subject, email: incident.reportedBy.email });
      }
    });

    for (const incident of answered) {
      await this.mailService
        .sendNotice(
          incident.email,
          `Tequio respondió tu reporte: ${incident.subject}`,
          `Actualizamos las credenciales de la cuenta${reason ? ` (${reason})` : ''}. Revisa que ya funcionen y, si todo está bien, cierra el reporte con "Ya quedó".`,
          { label: 'Ver el reporte', path: `/panel/soporte/${incident.id}` },
        )
        .catch((error: Error) => this.logger.warn(`No se pudo avisar por correo del reporte ${incident.id}: ${error.message}`));
    }

    return this.findById(orderId);
  }

  // ------------------------------------------------------------------ cancelar y reembolsar

  /**
   * El comprador retira su compra mientras el pago no se ha validado (no pierde nada: el stock
   * se libera). Una vez pagada solo el proveedor puede cancelarla, y el dinero se devuelve a mano
   * por transferencia (queda marcado como reembolso pendiente).
   */
  async cancel(orderId: string, requesterUserId: string) {
    const order = await this.prisma.providerOrder.findUnique({ where: { id: orderId }, include: ORDER_WITH_PARTIES });
    if (!order) {
      throw new NotFoundException('Orden no encontrada.');
    }
    const isBuyer = order.buyerUserId === requesterUserId;
    const isProvider = order.listing.providerProfile.userId === requesterUserId;
    if (!isBuyer && !isProvider) {
      throw new ForbiddenException('Solo el comprador o el proveedor de esta orden pueden cancelarla.');
    }
    if (!OPEN_STATUSES.includes(order.status)) {
      throw new BadRequestException('Solo se puede cancelar una orden que todavía está en curso.');
    }
    const paid = order.status === ProviderOrderStatus.PENDING_DELIVERY;
    if (paid && !isProvider) {
      throw new ForbiddenException('Tu pago ya fue validado. Si necesitas cancelar, escribe a soporte y te ayudamos con el reembolso.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.providerOrder.update({
        where: { id: orderId },
        data: { status: ProviderOrderStatus.CANCELLED, cancelledAt: new Date(), ...(paid ? {} : { receiptPath: null }) },
      });
      await this.releaseStock(tx, order);
      if (isProvider && !isBuyer) {
        await this.notificationsService.create(tx, {
          userId: order.buyerUserId,
          type: NotificationType.PROVIDER_ORDER_CANCELLED,
          payload: paid
            ? `Cancelamos tu compra de "${accountName(order.listing.plan)}". Te devolveremos $${Number(order.unitPrice).toFixed(2)} por transferencia a tu cuenta.`
            : `Cancelamos tu solicitud de "${accountName(order.listing.plan)}".`,
        });
      }
    });
    if (!paid && order.receiptPath) await deleteReceiptFile(this.receiptsDir, order.receiptPath);

    return this.findById(orderId);
  }

  /** El proveedor confirma que ya devolvió el dinero de una orden pagada y luego cancelada. */
  async markRefunded(orderId: string, providerUserId: string) {
    const order = await this.assertIsProviderOfOrder(orderId, providerUserId);
    if (order.status !== ProviderOrderStatus.CANCELLED || !order.paidAt) {
      throw new BadRequestException('Solo las órdenes pagadas y luego canceladas llevan reembolso.');
    }
    if (order.refundedAt) {
      throw new BadRequestException('Esta orden ya está marcada como reembolsada.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.providerOrder.update({ where: { id: orderId }, data: { refundedAt: new Date() } });
      await this.notificationsService.create(tx, {
        userId: order.buyerUserId,
        type: NotificationType.PROVIDER_ORDER_CANCELLED,
        payload: `Te devolvimos $${Number(order.unitPrice).toFixed(2)} por tu compra cancelada de "${accountName(order.listing.plan)}".`,
      });
    });
    return this.findById(orderId);
  }

  /** Crea el Group del comprador a partir de esta orden ya entregada — ver GroupsService.createFromProviderOrder. */
  async createGroup(orderId: string, buyerUserId: string, dto: CreateGroupFromProviderOrderDto) {
    return this.groupsService.createFromProviderOrder(buyerUserId, orderId, dto);
  }

  // ------------------------------------------------------------------ tareas programadas

  @Cron(CronExpression.EVERY_HOUR)
  async processHourly(): Promise<void> {
    await this.cancelUnpaidOrders();
    await this.sendExpiryNotices();
  }

  /** Reservas cuyo plazo para pagar venció sin comprobante: se cancelan solas y el stock vuelve al inventario. */
  private async cancelUnpaidOrders(): Promise<void> {
    const overdue = await this.prisma.providerOrder.findMany({
      where: { status: ProviderOrderStatus.AWAITING_PAYMENT, paymentDueAt: { lt: new Date() } },
      include: ORDER_WITH_PARTIES,
    });
    for (const order of overdue) {
      await this.prisma.$transaction(async (tx) => {
        const result = await tx.providerOrder.updateMany({
          where: { id: order.id, status: ProviderOrderStatus.AWAITING_PAYMENT },
          data: { status: ProviderOrderStatus.CANCELLED, cancelledAt: new Date() },
        });
        if (result.count === 0) return;
        await this.releaseStock(tx, order);
        await this.notificationsService.create(tx, {
          userId: order.buyerUserId,
          type: NotificationType.PROVIDER_ORDER_CANCELLED,
          payload: `Cancelamos tu reserva de "${accountName(order.listing.plan)}" porque no recibimos tu comprobante a tiempo. Puedes volver a reservarla cuando quieras.`,
        });
      });
      this.logger.log(`Orden ${order.id} cancelada por falta de pago (plazo vencido).`);
    }
  }

  /** Avisa al vendedor cuando una cuenta entregada está por vencer (7, 3 y 1 día antes) y cuando ya venció. */
  private async sendExpiryNotices(): Promise<void> {
    const now = Date.now();
    const candidates = await this.prisma.providerOrder.findMany({
      where: {
        status: ProviderOrderStatus.FULFILLED,
        renewsOrderId: null,
        expiresAt: { not: null, lte: new Date(now + EXPIRY_NOTICE_DAYS[0] * DAY_MS) },
        replacements: { none: { status: ProviderOrderStatus.FULFILLED } },
      },
      include: ORDER_WITH_PARTIES,
    });

    for (const order of candidates) {
      const daysLeft = (order.expiresAt!.getTime() - now) / DAY_MS;
      const stage = daysLeft <= 0 ? EXPIRY_NOTICE_DAYS.length + 1 : EXPIRY_NOTICE_DAYS.filter((limit) => daysLeft <= limit).length;
      if (stage <= order.expiryNoticeStage) continue;

      const name = accountName(order.listing.plan);
      const action = order.renewable ? 'Renuévala' : 'Compra su reposición';
      const expired = daysLeft <= 0;
      await this.prisma.$transaction(async (tx) => {
        await tx.providerOrder.update({ where: { id: order.id }, data: { expiryNoticeStage: stage } });
        if (expired && order.resultingGroupId) {
          // Los miembros siguen viendo una contraseña que puede dejar de servir: se les explica qué pasa y que no se les cobra.
          const members = await tx.groupMembership.findMany({
            where: { groupId: order.resultingGroupId, status: { in: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED] } },
            select: { userId: true },
          });
          for (const member of members) {
            await this.notificationsService.create(tx, {
              userId: member.userId,
              type: NotificationType.SYSTEM,
              email: false,
              groupId: order.resultingGroupId,
              payload: `La cuenta de ${order.listing.plan.platform?.name ?? 'tu grupo'} venció y el vendedor la está renovando. Mientras tanto no se te cobrará la renovación. Si la cuenta deja de funcionar, avísale desde Soporte.`,
            });
          }
        }
        await this.notificationsService.create(tx, {
          userId: order.buyerUserId,
          type: expired ? NotificationType.PROVIDER_ORDER_EXPIRED : NotificationType.PROVIDER_ORDER_EXPIRING,
          payload: expired
            ? `Tu cuenta "${name}" venció. ${action} en Mayoreo para que tu grupo pueda volver a recibir miembros.`
            : `Tu cuenta "${name}" vence el ${this.dateLabel(order.expiresAt!)}. ${action} desde Mayoreo para que tu grupo no se quede sin servicio.`,
        });
      });
    }
  }
}
