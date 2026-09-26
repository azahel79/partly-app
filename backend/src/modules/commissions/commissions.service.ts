import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CommissionChargeStatus, CommissionEntryStatus, GroupStatus, MembershipStatus, NotificationType, PaymentStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildReceiptFilename, deleteReceiptFile, resolveReceiptPath, saveReceiptFile } from '../../common/utils/receipt-storage.util';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { dayKey } from '../mail/quiet-hours';
import {
  COMMISSION_DUE_AFTER_DAYS,
  COMMISSION_GRACE_DAYS,
  COMMISSION_REMINDER_DAYS_BEFORE,
  DAY_MS,
  round2,
} from './commissions.constants';
import { ListAdminCommissionsQueryDto } from './dto/list-admin-commissions-query.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { ReviewCommissionDto } from './dto/review-commission.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';

type Db = PrismaService | Prisma.TransactionClient;

const EXTENSION_BY_MIMETYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const SETTINGS_ID = 'default';

const CHARGE_WITH_ENTRIES = {
  seller: { select: { id: true, name: true, email: true, avatarUrl: true } },
  entries: {
    select: {
      id: true,
      groupId: true,
      gross: true,
      commission: true,
      group: { select: { plan: { select: { tierName: true, platform: { select: { name: true } } } } } },
    },
  },
} satisfies Prisma.CommissionChargeInclude;

type ChargeWithEntries = Prisma.CommissionChargeGetPayload<{ include: typeof CHARGE_WITH_ENTRIES }>;

@Injectable()
export class CommissionsService {
  private readonly logger = new Logger(CommissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private get receiptsDir(): string {
    return this.configService.get<string>('receipts.dir')!;
  }

  // ------------------------------------------------------------------ registro de ganancias

  /**
   * Se llama al validar un pago (dentro de la misma transacción): anota cuánto entró, cuánto
   * de eso es comisión de Partly y cuánto se queda el vendedor. El dinero del comprador ya
   * cayó directo a la cuenta del vendedor, así que aquí no se mueve ningún saldo.
   */
  async recordEarning(
    tx: Prisma.TransactionClient,
    params: { paymentId: string; sellerId: string; groupId: string; billingCycleId: string; gross: number; commissionPercentage: number },
  ): Promise<void> {
    const commission = round2(params.gross * (params.commissionPercentage / 100));
    await tx.earningEntry.create({
      data: {
        paymentId: params.paymentId,
        sellerId: params.sellerId,
        groupId: params.groupId,
        billingCycleId: params.billingCycleId,
        gross: params.gross,
        commissionPercentage: params.commissionPercentage,
        commission,
        net: round2(params.gross - commission),
      },
    });
  }

  // ------------------------------------------------------------------ cuándo se cobra la comisión

  /**
   * Pasa a cobro la comisión que ya es exigible. Una ganancia lo es cuando el grupo se llenó y
   * todos pagaron ese ciclo, o cuando pasaron COMMISSION_DUE_AFTER_DAYS desde que arrancó el
   * ciclo (lo que ocurra primero). Se juntan en un solo cobro abierto por vendedor.
   */
  async billDueEntries(db: Db, sellerId?: string): Promise<void> {
    const accrued = await db.earningEntry.findMany({
      where: { status: CommissionEntryStatus.ACCRUED, ...(sellerId ? { sellerId } : {}) },
      include: {
        group: { select: { id: true, occupiedSlots: true, availableSlots: true } },
        billingCycle: { select: { periodStart: true } },
      },
    });
    if (accrued.length === 0) return;

    const now = new Date();
    const dueByGroupCycle = new Map<string, boolean>();
    const dueBySeller = new Map<string, string[]>();

    for (const entry of accrued) {
      const key = `${entry.groupId}:${entry.billingCycleId}`;
      let isDue = dueByGroupCycle.get(key);
      if (isDue === undefined) {
        isDue = await this.isCycleCommissionDue(db, entry, now);
        dueByGroupCycle.set(key, isDue);
      }
      if (isDue) {
        dueBySeller.set(entry.sellerId, [...(dueBySeller.get(entry.sellerId) ?? []), entry.id]);
      }
    }

    for (const [entrySellerId, entryIds] of dueBySeller) {
      await this.attachToOpenCharge(db, entrySellerId, entryIds, now);
    }
  }

  private async isCycleCommissionDue(
    db: Db,
    entry: { groupId: string; billingCycleId: string; group: { occupiedSlots: number; availableSlots: number }; billingCycle: { periodStart: Date } },
    now: Date,
  ): Promise<boolean> {
    if (entry.billingCycle.periodStart.getTime() + COMMISSION_DUE_AFTER_DAYS * DAY_MS <= now.getTime()) {
      return true;
    }
    if (entry.group.occupiedSlots < entry.group.availableSlots) {
      return false;
    }
    const pending = await db.payment.count({
      where: { billingCycleId: entry.billingCycleId, membership: { groupId: entry.groupId }, status: PaymentStatus.PENDING },
    });
    return pending === 0;
  }

  private async attachToOpenCharge(db: Db, sellerId: string, entryIds: string[], now: Date): Promise<void> {
    const entries = await db.earningEntry.findMany({ where: { id: { in: entryIds } }, select: { commission: true } });
    const amount = round2(entries.reduce((sum, e) => sum + Number(e.commission), 0));

    const open = await db.commissionCharge.findFirst({
      where: { sellerId, status: CommissionChargeStatus.PENDING },
      orderBy: { createdAt: 'asc' },
    });

    let chargeId: string;
    let total: number;
    let payBy: Date;
    if (open) {
      const updated = await db.commissionCharge.update({ where: { id: open.id }, data: { amount: { increment: amount } } });
      chargeId = updated.id;
      total = Number(updated.amount);
      payBy = updated.payBy;
    } else {
      payBy = new Date(now.getTime() + COMMISSION_GRACE_DAYS * DAY_MS);
      const created = await db.commissionCharge.create({ data: { sellerId, amount, dueAt: now, payBy } });
      chargeId = created.id;
      total = amount;
    }

    await db.earningEntry.updateMany({
      where: { id: { in: entryIds } },
      data: { status: CommissionEntryStatus.BILLED, chargeId },
    });

    await this.notificationsService.create(db, {
      userId: sellerId,
      type: NotificationType.COMMISSION_DUE,
      payload: open
        ? `Se sumaron $${amount.toFixed(2)} a tu comisión por pagar: ahora son $${total.toFixed(2)}. Págala antes del ${this.dateLabel(payBy)}.`
        : `Tienes una comisión de $${total.toFixed(2)} por pagar a Partly. Transfiérela y sube tu comprobante antes del ${this.dateLabel(payBy)} para que tus grupos sigan recibiendo miembros.`,
    });
  }

  // ------------------------------------------------------------------ restricción por falta de pago

  /**
   * Comisión vencida sin pagar: el vendedor no puede abrir grupos nuevos ni recibir miembros.
   * Mientras Partly no publique su cuenta bancaria no hay a dónde pagar, así que tampoco se restringe a nadie.
   */
  async getRestriction(sellerId: string, db: Db = this.prisma) {
    if (!(await this.hasBankAccount(db))) {
      return { restricted: false, overdueAmount: 0, since: null as Date | null };
    }
    const overdue = await db.commissionCharge.findMany({
      where: { sellerId, status: CommissionChargeStatus.PENDING, payBy: { lt: new Date() } },
      orderBy: { payBy: 'asc' },
    });
    return {
      restricted: overdue.length > 0,
      overdueAmount: round2(overdue.reduce((sum, c) => sum + Number(c.amount), 0)),
      since: overdue[0]?.payBy ?? null,
    };
  }

  async assertNotRestricted(sellerId: string, action: string): Promise<void> {
    const restriction = await this.getRestriction(sellerId);
    if (restriction.restricted) {
      throw new ForbiddenException(
        `No puedes ${action} porque tienes una comisión vencida de $${restriction.overdueAmount.toFixed(2)}. Págala en Comisiones y se reactiva al validarse.`,
      );
    }
  }

  /** Vendedores con comisión vencida — el marketplace oculta sus grupos y no acepta nuevos miembros. */
  async restrictedSellerIds(db: Db = this.prisma): Promise<string[]> {
    if (!(await this.hasBankAccount(db))) return [];
    const rows = await db.commissionCharge.findMany({
      where: { status: CommissionChargeStatus.PENDING, payBy: { lt: new Date() } },
      select: { sellerId: true },
      distinct: ['sellerId'],
    });
    return rows.map((r) => r.sellerId);
  }

  /** Resumen liviano para el aviso del panel del vendedor. */
  async getStatus(sellerId: string) {
    const [pending, inReview, restriction] = await Promise.all([
      this.prisma.commissionCharge.findMany({ where: { sellerId, status: CommissionChargeStatus.PENDING }, orderBy: { payBy: 'asc' } }),
      this.prisma.commissionCharge.count({ where: { sellerId, status: CommissionChargeStatus.IN_REVIEW } }),
      this.getRestriction(sellerId),
    ]);
    return {
      toPay: round2(pending.reduce((sum, c) => sum + Number(c.amount), 0)),
      payBy: pending[0]?.payBy ?? null,
      inReview,
      restricted: restriction.restricted,
    };
  }

  // ------------------------------------------------------------------ vista del vendedor: ganancias

  async getEarningsSummary(sellerId: string) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [byStatus, month, charges, cycles] = await Promise.all([
      this.prisma.earningEntry.groupBy({ by: ['status'], where: { sellerId }, _sum: { gross: true, commission: true, net: true }, _count: true }),
      this.prisma.earningEntry.aggregate({ where: { sellerId, createdAt: { gte: monthStart } }, _sum: { gross: true, commission: true, net: true }, _count: true }),
      this.prisma.commissionCharge.findMany({ where: { sellerId }, select: { status: true, amount: true } }),
      this.prisma.earningEntry.findMany({ where: { sellerId }, select: { groupId: true, billingCycleId: true }, distinct: ['groupId', 'billingCycleId'] }),
    ]);

    const sum = (field: 'gross' | 'commission' | 'net', statuses?: CommissionEntryStatus[]) =>
      round2(byStatus.filter((s) => !statuses || statuses.includes(s.status)).reduce((total, s) => total + Number(s._sum[field] ?? 0), 0));
    const chargesSum = (status: CommissionChargeStatus) => round2(charges.filter((c) => c.status === status).reduce((total, c) => total + Number(c.amount), 0));

    const groupIds = [...new Set(cycles.map((c) => c.groupId))];
    const groups = await this.prisma.group.findMany({
      where: { id: { in: groupIds } },
      include: { plan: { include: { platform: { select: { name: true } } } }, sourceProviderOrder: { select: { unitPrice: true } } },
    });
    const perGroup = await this.prisma.earningEntry.groupBy({
      by: ['groupId'],
      where: { sellerId },
      _sum: { gross: true, commission: true, net: true },
      _count: true,
    });

    const byGroup = perGroup
      .map((row) => {
        const group = groups.find((g) => g.id === row.groupId);
        if (!group) return null;
        const cyclesBilled = cycles.filter((c) => c.groupId === row.groupId).length;
        const accountCost = group.sourceProviderOrder ? Number(group.sourceProviderOrder.unitPrice) : Number(group.plan.officialPrice);
        const net = round2(Number(row._sum.net ?? 0));
        return {
          groupId: group.id,
          platformName: group.plan.platform.name,
          tierName: group.plan.tierName,
          status: group.status,
          payments: row._count,
          cyclesBilled,
          gross: round2(Number(row._sum.gross ?? 0)),
          commission: round2(Number(row._sum.commission ?? 0)),
          net,
          accountCost,
          accountCostFromWholesale: group.sourceProviderOrder !== null,
          // Lo que realmente le queda: lo cobrado menos comisión, menos lo que le costó la cuenta cada ciclo.
          profit: round2(net - accountCost * cyclesBilled),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.net - a.net);

    return {
      totals: { gross: sum('gross'), commission: sum('commission'), net: sum('net'), payments: byStatus.reduce((t, s) => t + s._count, 0) },
      thisMonth: {
        gross: round2(Number(month._sum.gross ?? 0)),
        commission: round2(Number(month._sum.commission ?? 0)),
        net: round2(Number(month._sum.net ?? 0)),
        payments: month._count,
      },
      commission: {
        // Ya generada pero todavía no exigible (el grupo no se llena ni cumple los días).
        accrued: sum('commission', [CommissionEntryStatus.ACCRUED]),
        toPay: chargesSum(CommissionChargeStatus.PENDING),
        inReview: chargesSum(CommissionChargeStatus.IN_REVIEW),
        paid: sum('commission', [CommissionEntryStatus.SETTLED]),
      },
      byGroup,
      restriction: await this.getRestriction(sellerId),
      graceDays: COMMISSION_GRACE_DAYS,
    };
  }

  async findEarningEntries(sellerId: string, query: PaginationQueryDto) {
    const where: Prisma.EarningEntryWhereInput = { sellerId };
    const [rows, total] = await Promise.all([
      this.prisma.earningEntry.findMany({
        where,
        include: {
          group: { select: { id: true, plan: { select: { tierName: true, platform: { select: { name: true } } } } } },
          payment: { select: { membership: { select: { user: { select: { name: true } } } } } },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.earningEntry.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        groupId: row.groupId,
        platformName: row.group.plan.platform.name,
        tierName: row.group.plan.tierName,
        buyerName: row.payment.membership.user.name,
        gross: Number(row.gross),
        commissionPercentage: Number(row.commissionPercentage),
        commission: Number(row.commission),
        net: Number(row.net),
        status: row.status,
      })),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  // ------------------------------------------------------------------ vista del vendedor: comisiones por pagar

  async getMyCommissions(sellerId: string) {
    const [charges, bankAccount, restriction] = await Promise.all([
      this.prisma.commissionCharge.findMany({
        where: { sellerId },
        include: CHARGE_WITH_ENTRIES,
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.getBankAccount(),
      this.getRestriction(sellerId),
    ]);
    return { charges: charges.map((c) => this.toChargeView(c, bankAccount !== null)), bankAccount, restriction, graceDays: COMMISSION_GRACE_DAYS };
  }

  /** El vendedor sube su comprobante de la transferencia a Partly: el cobro queda en revisión del admin. */
  async uploadReceipt(chargeId: string, sellerId: string, file: Express.Multer.File) {
    const extension = EXTENSION_BY_MIMETYPE[file.mimetype];
    if (!extension) {
      throw new BadRequestException('Solo se aceptan comprobantes en JPG, PNG, WEBP o PDF.');
    }

    const charge = await this.prisma.commissionCharge.findUnique({ where: { id: chargeId }, include: { seller: { select: { name: true } } } });
    if (!charge || charge.sellerId !== sellerId) {
      throw new NotFoundException('No encontramos esa comisión.');
    }
    if (charge.status !== CommissionChargeStatus.PENDING) {
      throw new BadRequestException(
        charge.status === CommissionChargeStatus.IN_REVIEW ? 'Ya enviaste el comprobante; está en revisión.' : 'Esta comisión ya está pagada.',
      );
    }

    const filename = buildReceiptFilename(charge.seller.name, 'comision', new Date(), extension);
    await saveReceiptFile(this.receiptsDir, filename, file.buffer);

    const admins = await this.prisma.user.findMany({ where: { role: Role.ADMIN, deletedAt: null }, select: { id: true } });
    const updated = await this.prisma.$transaction(async (tx) => {
      // El where con status: PENDING evita pisar un cobro que otra petición ya pasó a revisión.
      const result = await tx.commissionCharge.updateMany({
        where: { id: chargeId, status: CommissionChargeStatus.PENDING },
        data: { status: CommissionChargeStatus.IN_REVIEW, receiptPath: filename, receiptUploadedAt: new Date(), rejectionReason: null },
      });
      if (result.count === 0) {
        throw new BadRequestException('Este cobro ya no acepta comprobantes.');
      }
      for (const admin of admins) {
        await this.notificationsService.create(tx, {
          userId: admin.id,
          type: NotificationType.COMMISSION_RECEIPT_UPLOADED,
          payload: `${charge.seller.name} subió el comprobante de su comisión de $${Number(charge.amount).toFixed(2)}. Revísalo cuando puedas.`,
        });
      }
      return tx.commissionCharge.findUniqueOrThrow({ where: { id: chargeId }, include: CHARGE_WITH_ENTRIES });
    });

    return this.toChargeView(updated);
  }

  async getReceiptFilePath(chargeId: string, requester: AuthenticatedUser): Promise<{ absolutePath: string; filename: string }> {
    const charge = await this.prisma.commissionCharge.findUnique({ where: { id: chargeId } });
    if (!charge) {
      throw new NotFoundException('No encontramos esa comisión.');
    }
    if (charge.sellerId !== requester.id && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('No tienes acceso a este comprobante.');
    }
    if (!charge.receiptPath) {
      throw new NotFoundException('Esta comisión todavía no tiene un comprobante.');
    }
    return { absolutePath: resolveReceiptPath(this.receiptsDir, charge.receiptPath), filename: charge.receiptPath };
  }

  // ------------------------------------------------------------------ vista del admin

  async findAllCharges(query: ListAdminCommissionsQueryDto) {
    const where: Prisma.CommissionChargeWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.overdueOnly ? { status: CommissionChargeStatus.PENDING, payBy: { lt: new Date() } } : {}),
      ...(query.search
        ? { seller: { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { email: { contains: query.search, mode: 'insensitive' } }] } }
        : {}),
    };

    const [charges, total, payable] = await Promise.all([
      this.prisma.commissionCharge.findMany({
        where,
        include: CHARGE_WITH_ENTRIES,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.commissionCharge.count({ where }),
      this.hasBankAccount(this.prisma),
    ]);

    return {
      data: charges.map((c) => ({ ...this.toChargeView(c, payable), seller: c.seller })),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  async getAdminSummary() {
    const now = new Date();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [pending, inReview, overdue, paidThisMonth, accrued, restrictedSellers] = await Promise.all([
      this.prisma.commissionCharge.aggregate({ where: { status: CommissionChargeStatus.PENDING }, _sum: { amount: true }, _count: true }),
      this.prisma.commissionCharge.aggregate({ where: { status: CommissionChargeStatus.IN_REVIEW }, _sum: { amount: true }, _count: true }),
      this.prisma.commissionCharge.aggregate({ where: { status: CommissionChargeStatus.PENDING, payBy: { lt: now } }, _sum: { amount: true }, _count: true }),
      this.prisma.commissionCharge.aggregate({ where: { status: CommissionChargeStatus.PAID, paidAt: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
      this.prisma.earningEntry.aggregate({ where: { status: CommissionEntryStatus.ACCRUED }, _sum: { commission: true } }),
      this.restrictedSellerIds(),
    ]);

    const amount = (row: { _sum: { amount: Prisma.Decimal | null } }) => round2(Number(row._sum.amount ?? 0));
    return {
      pending: { count: pending._count, amount: amount(pending) },
      inReview: { count: inReview._count, amount: amount(inReview) },
      overdue: { count: overdue._count, amount: amount(overdue) },
      paidThisMonth: { count: paidThisMonth._count, amount: amount(paidThisMonth) },
      accruedNotBilled: round2(Number(accrued._sum.commission ?? 0)),
      restrictedSellers: restrictedSellers.length,
      graceDays: COMMISSION_GRACE_DAYS,
    };
  }

  /** El admin confirma que la transferencia llegó (liquida las ganancias del cobro) o rechaza el comprobante. */
  async review(chargeId: string, dto: ReviewCommissionDto, admin: AuthenticatedUser) {
    const charge = await this.prisma.commissionCharge.findUnique({ where: { id: chargeId } });
    if (!charge) {
      throw new NotFoundException('No encontramos esa comisión.');
    }
    if (charge.status !== CommissionChargeStatus.IN_REVIEW || !charge.receiptPath) {
      throw new BadRequestException('Esta comisión no tiene un comprobante esperando revisión.');
    }
    const amountLabel = Number(charge.amount).toFixed(2);

    if (dto.approve) {
      const updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.commissionCharge.updateMany({
          where: { id: chargeId, status: CommissionChargeStatus.IN_REVIEW },
          data: { status: CommissionChargeStatus.PAID, paidAt: new Date(), reviewedAt: new Date(), reviewedByUserId: admin.id, rejectionReason: null },
        });
        if (result.count === 0) {
          throw new BadRequestException('Esta comisión ya fue revisada por otra solicitud.');
        }
        await tx.earningEntry.updateMany({ where: { chargeId }, data: { status: CommissionEntryStatus.SETTLED } });
        await tx.adminActionLog.create({
          data: { adminUserId: admin.id, actionType: 'COMMISSION_APPROVED', targetEntity: 'CommissionCharge', targetId: chargeId, reason: `$${amountLabel}` },
        });
        await this.notificationsService.create(tx, {
          userId: charge.sellerId,
          type: NotificationType.COMMISSION_PAID,
          payload: `Recibimos tu pago de comisión de $${amountLabel}. ¡Gracias! Tus grupos siguen activos.`,
        });
        if (!(await this.getRestriction(charge.sellerId, tx)).restricted) {
          await this.notifyWaitingBuyers(tx, charge.sellerId, false);
        }
        return tx.commissionCharge.findUniqueOrThrow({ where: { id: chargeId }, include: CHARGE_WITH_ENTRIES });
      });
      return this.toChargeView(updated);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.commissionCharge.updateMany({
        where: { id: chargeId, status: CommissionChargeStatus.IN_REVIEW },
        data: {
          status: CommissionChargeStatus.PENDING,
          receiptPath: null,
          receiptUploadedAt: null,
          rejectionReason: dto.reason?.trim() || 'El comprobante no pudo validarse.',
          reviewedAt: new Date(),
          reviewedByUserId: admin.id,
        },
      });
      if (result.count === 0) {
        throw new BadRequestException('Esta comisión ya fue revisada por otra solicitud.');
      }
      await tx.adminActionLog.create({
        data: { adminUserId: admin.id, actionType: 'COMMISSION_REJECTED', targetEntity: 'CommissionCharge', targetId: chargeId, reason: dto.reason ?? null },
      });
      await this.notificationsService.create(tx, {
        userId: charge.sellerId,
        type: NotificationType.COMMISSION_REJECTED,
        payload: dto.reason
          ? `Rechazamos tu comprobante de comisión: ${dto.reason}. Súbelo de nuevo.`
          : 'Rechazamos tu comprobante de comisión. Súbelo de nuevo.',
      });
      return tx.commissionCharge.findUniqueOrThrow({ where: { id: chargeId }, include: CHARGE_WITH_ENTRIES });
    });

    await deleteReceiptFile(this.receiptsDir, charge.receiptPath!);
    return this.toChargeView(updated);
  }

  /**
   * Botón "Enviar recordatorio" del admin sobre una comisión por pagar: le llega al vendedor por la
   * app y por correo, sin esperar a la mañana. Máximo uno por vendedor al día.
   */
  async sendManualReminder(chargeId: string, admin: AuthenticatedUser) {
    const charge = await this.prisma.commissionCharge.findUnique({
      where: { id: chargeId },
      include: { seller: { select: { id: true, name: true, emailNotifications: true, inAppNotifications: true } } },
    });
    if (!charge) {
      throw new NotFoundException('No encontramos esa comisión.');
    }
    if (charge.status !== CommissionChargeStatus.PENDING) {
      throw new BadRequestException(
        charge.status === CommissionChargeStatus.IN_REVIEW ? 'Este vendedor ya envió su comprobante: falta que lo revises.' : 'Esta comisión ya está pagada.',
      );
    }
    const today = dayKey(new Date());
    const already = await this.prisma.adminActionLog.findFirst({ where: { actionType: 'MANUAL_REMINDER', targetId: charge.seller.id, reason: today } });
    if (already) {
      throw new ConflictException(`Ya le enviaste un recordatorio a ${charge.seller.name} hoy. Vuelve a intentarlo mañana.`);
    }

    const overdue = charge.payBy.getTime() < Date.now();
    await this.prisma.$transaction(async (tx) => {
      await this.notificationsService.create(tx, {
        userId: charge.seller.id,
        type: overdue ? NotificationType.COMMISSION_OVERDUE : NotificationType.COMMISSION_REMINDER,
        payload: overdue
          ? `Recordatorio de Partly: tu comisión de $${Number(charge.amount).toFixed(2)} está vencida. Págala y sube tu comprobante para que tus grupos sigan recibiendo miembros.`
          : `Recordatorio de Partly: tienes una comisión de $${Number(charge.amount).toFixed(2)} por pagar antes del ${this.dateLabel(charge.payBy)}. Transfiérela y sube tu comprobante.`,
        emailDedupeKey: `manual-reminder:${charge.seller.id}:${today}`,
        emailImmediate: true,
      });
      await tx.adminActionLog.create({ data: { adminUserId: admin.id, actionType: 'MANUAL_REMINDER', targetEntity: 'CommissionCharge', targetId: charge.seller.id, reason: today } });
    });

    return { sentTo: 'SELLER' as const, name: charge.seller.name, inApp: charge.seller.inAppNotifications, email: charge.seller.emailNotifications };
  }

  // ------------------------------------------------------------------ cuenta bancaria de Partly

  private async hasBankAccount(db: Db): Promise<boolean> {
    const settings = await db.platformSettings.findUnique({ where: { id: SETTINGS_ID } });
    return Boolean(settings?.bankHolder && settings.bankName && settings.bankClabe);
  }

  /** La cuenta donde los vendedores transfieren la comisión, o null mientras el admin no la configure. */
  async getBankAccount(): Promise<{ holder: string; bankName: string; clabe: string; reference: string | null } | null> {
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!settings?.bankHolder || !settings.bankName || !settings.bankClabe) {
      return null;
    }
    return { holder: settings.bankHolder, bankName: settings.bankName, clabe: settings.bankClabe, reference: settings.bankReference };
  }

  async updateBankAccount(dto: UpdateBankAccountDto, admin: AuthenticatedUser) {
    const data = {
      bankHolder: dto.holder.trim(),
      bankName: dto.bankName.trim(),
      bankClabe: dto.clabe,
      bankReference: dto.reference?.trim() || null,
      updatedByUserId: admin.id,
    };
    await this.prisma.platformSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...data }, update: data });
    await this.prisma.adminActionLog.create({
      data: { adminUserId: admin.id, actionType: 'PLATFORM_BANK_ACCOUNT_UPDATED', targetEntity: 'PlatformSettings', targetId: SETTINGS_ID, reason: `${data.bankName} ••••${dto.clabe.slice(-4)}` },
    });
    return this.getBankAccount();
  }

  // ------------------------------------------------------------------ tarea diaria

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processDaily(): Promise<void> {
    await this.billDueEntries(this.prisma);
    await this.sendReminders();
    await this.notifyOverdue();
    await this.cleanupOldReceipts();
  }

  private async sendReminders(): Promise<void> {
    const now = new Date();
    const dueSoon = await this.prisma.commissionCharge.findMany({
      where: {
        status: CommissionChargeStatus.PENDING,
        reminderSentAt: null,
        payBy: { gt: now, lte: new Date(now.getTime() + COMMISSION_REMINDER_DAYS_BEFORE * DAY_MS) },
      },
    });
    for (const charge of dueSoon) {
      await this.prisma.$transaction(async (tx) => {
        await this.notificationsService.create(tx, {
          userId: charge.sellerId,
          type: NotificationType.COMMISSION_REMINDER,
          payload: `Tu comisión de $${Number(charge.amount).toFixed(2)} vence el ${this.dateLabel(charge.payBy)}. Págala para que tus grupos no dejen de recibir miembros.`,
        });
        await tx.commissionCharge.update({ where: { id: charge.id }, data: { reminderSentAt: now } });
      });
    }
  }

  private async notifyOverdue(): Promise<void> {
    if (!(await this.hasBankAccount(this.prisma))) return;
    const now = new Date();
    const overdue = await this.prisma.commissionCharge.findMany({
      where: { status: CommissionChargeStatus.PENDING, payBy: { lt: now }, overdueNotifiedAt: null },
    });
    for (const charge of overdue) {
      await this.prisma.$transaction(async (tx) => {
        await this.notificationsService.create(tx, {
          userId: charge.sellerId,
          type: NotificationType.COMMISSION_OVERDUE,
          payload: `Tu comisión de $${Number(charge.amount).toFixed(2)} está vencida. Mientras no la pagues, tus grupos no reciben miembros y no puedes abrir grupos nuevos.`,
        });
        await this.notifyWaitingBuyers(tx, charge.sellerId, true);
        await tx.commissionCharge.update({ where: { id: charge.id }, data: { overdueNotifiedAt: now } });
      });
      this.logger.warn(`Vendedor ${charge.sellerId} restringido por comisión vencida de $${charge.amount.toString()}.`);
    }
  }

  /**
   * Los compradores que apartaron cupo en un grupo que todavía no inicia se enteran cuando el vendedor queda
   * detenido por una comisión vencida (su reserva sigue en pie y no pagan nada) y cuando ya se puede reanudar.
   */
  private async notifyWaitingBuyers(tx: Prisma.TransactionClient, sellerId: string, halted: boolean): Promise<void> {
    const waiting = await tx.groupMembership.findMany({
      where: {
        status: MembershipStatus.RESERVED,
        group: { ownerId: sellerId, startedAt: null, status: { in: [GroupStatus.SEARCHING_MEMBERS, GroupStatus.READY_TO_START] } },
      },
      include: { group: { include: { plan: { include: { platform: { select: { name: true } } } } } } },
    });
    for (const membership of waiting) {
      const platform = membership.group.plan.platform.name;
      await this.notificationsService.create(tx, {
        userId: membership.userId,
        type: NotificationType.SYSTEM,
        groupId: membership.groupId,
        payload: halted
          ? `El grupo de ${platform} donde apartaste tu cupo está detenido: el vendedor tiene un pendiente con Partly y no puede iniciarlo por ahora. Tu reserva sigue en pie y no pagas nada. Si prefieres no esperar, puedes salirte sin costo y buscar otro grupo.`
          : `Buenas noticias: el vendedor del grupo de ${platform} ya quedó al corriente con Partly y puede iniciarlo. Tu cupo sigue reservado y no pagas nada hasta que arranque.`,
      });
    }
  }

  private async cleanupOldReceipts(): Promise<void> {
    const retentionDays = this.configService.get<number>('receipts.retentionDays')!;
    const cutoff = new Date(Date.now() - retentionDays * DAY_MS);
    const old = await this.prisma.commissionCharge.findMany({
      where: { receiptPath: { not: null }, status: CommissionChargeStatus.PAID, receiptUploadedAt: { lt: cutoff } },
      select: { id: true, receiptPath: true },
    });
    for (const charge of old) {
      await deleteReceiptFile(this.receiptsDir, charge.receiptPath!);
      await this.prisma.commissionCharge.update({ where: { id: charge.id }, data: { receiptPath: null } });
    }
  }

  // ------------------------------------------------------------------ helpers

  private dateLabel(date: Date): string {
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' });
  }

  /** Un cobro con sus ganancias resumidas por grupo (lo que ve el vendedor y el admin). */
  private toChargeView(charge: ChargeWithEntries, payable = true) {
    const byGroup = new Map<string, { groupId: string; platformName: string; tierName: string; payments: number; gross: number; commission: number }>();
    for (const entry of charge.entries) {
      const row = byGroup.get(entry.groupId) ?? {
        groupId: entry.groupId,
        platformName: entry.group.plan.platform.name,
        tierName: entry.group.plan.tierName,
        payments: 0,
        gross: 0,
        commission: 0,
      };
      row.payments += 1;
      row.gross = round2(row.gross + Number(entry.gross));
      row.commission = round2(row.commission + Number(entry.commission));
      byGroup.set(entry.groupId, row);
    }
    return {
      id: charge.id,
      status: charge.status,
      amount: Number(charge.amount),
      dueAt: charge.dueAt,
      payBy: charge.payBy,
      overdue: payable && charge.status === CommissionChargeStatus.PENDING && charge.payBy.getTime() < Date.now(),
      hasReceipt: charge.receiptPath !== null,
      receiptUploadedAt: charge.receiptUploadedAt,
      rejectionReason: charge.rejectionReason,
      paidAt: charge.paidAt,
      createdAt: charge.createdAt,
      groups: [...byGroup.values()],
    };
  }
}
