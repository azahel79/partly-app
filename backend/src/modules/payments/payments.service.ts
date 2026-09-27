import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingCycleStatus, BillingPeriod, GroupStatus, MembershipStatus, NotificationType, PaymentStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { addBillingPeriod, computeJoinPricing } from '../../common/utils/billing.util';
import { dayKey } from '../mail/quiet-hours';
import { buildReceiptFilename, deleteReceiptFile, receiptMatchesType, resolveReceiptPath, saveReceiptFile } from '../../common/utils/receipt-storage.util';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { CommissionsService } from '../commissions/commissions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { ListPendingPaymentsQueryDto } from './dto/list-pending-payments-query.dto';
import { ReviewPaymentReceiptDto } from './dto/review-payment-receipt.dto';
import { ListAdminPaymentsQueryDto, ReceiptFilter } from './dto/list-admin-payments-query.dto';

const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000; // 48 horas de gracia tras la fecha de corte
// Plazo para cubrir el primer pago: cuentan desde que el pago se genera (al iniciar el
// grupo, o al entrar a uno ya iniciado), no desde la fecha de corte del ciclo.
const FIRST_PAYMENT_WINDOW_MS = 48 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// La renovación se cobra por adelantado: el cobro del ciclo siguiente se genera 3 días antes del corte.
const RENEWAL_WINDOW_MS = 3 * DAY_MS;

const EXTENSION_BY_MIMETYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

type GroupForBilling = {
  id: string;
  pricePerSlot: Prisma.Decimal;
  nextRenewalDate: Date;
  createdAt: Date;
  startedAt: Date | null;
  plan: { billingPeriod: BillingPeriod };
};

const WITH_MEMBER = {
  membership: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly commissionsService: CommissionsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private get receiptsDir(): string {
    return this.configService.get<string>('receipts.dir')!;
  }

  /** Vista global de solo lectura para que staff supervise comprobantes y estados. */
  /** Búsqueda del monitor de pagos: comprador, vendedor (nombre o correo) o plataforma/plan del grupo. */
  private adminPaymentSearch(q: string): Prisma.PaymentWhereInput[] {
    const contains = { contains: q, mode: Prisma.QueryMode.insensitive };
    return [
      { membership: { user: { name: contains } } },
      { membership: { user: { email: contains } } },
      { membership: { group: { owner: { name: contains } } } },
      { membership: { group: { owner: { email: contains } } } },
      { membership: { group: { plan: { tierName: contains } } } },
      { membership: { group: { plan: { platform: { name: contains } } } } },
    ];
  }

  async findAllForAdmin(query: ListAdminPaymentsQueryDto) {
    const where: Prisma.PaymentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.receipt === ReceiptFilter.UPLOADED ? { receiptPath: { not: null } } : {}),
      ...(query.receipt === ReceiptFilter.MISSING ? { receiptPath: null } : {}),
      ...(query.groupId ? { membership: { groupId: query.groupId } } : {}),
      ...(query.q ? { OR: this.adminPaymentSearch(query.q) } : {}),
    };

    const [payments, total, missingReceipt, awaitingSeller, approved, failed] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          membership: {
            include: {
              user: { select: { id: true, name: true, email: true, avatarUrl: true } },
              group: {
                include: {
                  plan: { include: { platform: { select: { id: true, name: true, logoUrl: true } } } },
                  owner: { select: { id: true, name: true, email: true } },
                },
              },
            },
          },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ receiptUploadedAt: 'desc' }, { graceUntil: 'asc' }],
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.count({ where: { status: PaymentStatus.PENDING, receiptPath: null } }),
      this.prisma.payment.count({ where: { status: PaymentStatus.PENDING, receiptPath: { not: null } } }),
      this.prisma.payment.count({ where: { status: PaymentStatus.PAID } }),
      this.prisma.payment.count({ where: { status: PaymentStatus.FAILED } }),
    ]);

    return {
      data: payments.map((payment) => ({
        id: payment.id,
        amount: payment.amount.toString(),
        status: payment.status,
        receiptUploadedAt: payment.receiptUploadedAt,
        paidAt: payment.paidAt,
        graceUntil: payment.graceUntil,
        requestedAt: payment.membership.joinedAt,
        membershipStatus: payment.membership.status,
        group: {
          id: payment.membership.group.id,
          platform: payment.membership.group.plan.platform,
          planName: payment.membership.group.plan.tierName,
        },
        buyer: payment.membership.user,
        seller: payment.membership.group.owner,
      })),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
      counts: { missingReceipt, awaitingSeller, approved, failed },
    };
  }

  /**
   * Se llama al unirse a un grupo (dentro de la misma transacción): mete a la membresía
   * en el ciclo de facturación abierto del grupo (lo crea si es el primer miembro) con
   * un monto prorrateado según los días que le quedan a ese ciclo.
   */
  async createInitialPayment(tx: Prisma.TransactionClient, group: GroupForBilling, membershipId: string): Promise<void> {
    const now = new Date();
    let cycle = await tx.billingCycle.findFirst({ where: { groupId: group.id, status: BillingCycleStatus.OPEN } });
    if (!cycle) {
      cycle = await tx.billingCycle.create({
        data: {
          groupId: group.id,
          periodStart: group.startedAt ?? group.createdAt,
          periodEnd: group.nextRenewalDate,
          status: BillingCycleStatus.OPEN,
        },
      });
    }

    const pricing = computeJoinPricing(Number(group.pricePerSlot), cycle.periodStart, cycle.periodEnd, group.plan.billingPeriod, now);

    await tx.payment.create({
      data: {
        billingCycleId: cycle.id,
        membershipId,
        amount: pricing.amountToPay,
        status: PaymentStatus.PENDING,
        coveredFrom: pricing.coveredFrom,
        coveredUntil: pricing.coveredUntil,
        proratedDays: pricing.isProrated ? pricing.remainingDays : null,
        includesNextCycle: pricing.includesNextCycle,
        // 48h para pagar desde que entra, no hasta el corte: así el cupo no queda apartado
        // semanas por alguien que nunca transfirió.
        graceUntil: new Date(now.getTime() + FIRST_PAYMENT_WINDOW_MS),
      },
    });

    // Si ya paga el ciclo siguiente, su siguiente renovación es un ciclo después.
    if (pricing.includesNextCycle) {
      await tx.groupMembership.update({ where: { id: membershipId }, data: { currentPeriodEnd: pricing.coveredUntil } });
    }
  }

  /**
   * Pago de un ciclo completo para un cupo que ya estaba reservado: se genera cuando el
   * vendedor inicia el grupo, con 48 horas para cubrirlo.
   */
  async createCyclePayment(
    tx: Prisma.TransactionClient,
    billingCycleId: string,
    membershipId: string,
    amount: number,
    from: Date = new Date(),
  ): Promise<void> {
    const cycle = await tx.billingCycle.findUniqueOrThrow({ where: { id: billingCycleId } });
    await tx.payment.create({
      data: {
        billingCycleId,
        membershipId,
        amount,
        status: PaymentStatus.PENDING,
        coveredFrom: cycle.periodStart,
        coveredUntil: cycle.periodEnd,
        graceUntil: new Date(from.getTime() + FIRST_PAYMENT_WINDOW_MS),
      },
    });
  }

  /**
   * Cobro por adelantado del ciclo siguiente. Cuelga del ciclo en curso y cubre desde su fin hasta el fin del
   * ciclo que sigue; el comprador paga ANTES de usar el mes nuevo. Tiene hasta 48 horas después del corte
   * para pagar: pasado ese plazo pierde su lugar (expireOverdueSuspensions).
   */
  private async createRenewalCharge(
    tx: Prisma.TransactionClient,
    membership: { id: string; userId: string; groupId: string },
    cycle: { id: string; periodEnd: Date },
    group: { pricePerSlot: Prisma.Decimal; plan: { billingPeriod: BillingPeriod; platform: { name: string } } },
    intro: string,
  ): Promise<void> {
    const newPeriodEnd = addBillingPeriod(cycle.periodEnd, group.plan.billingPeriod);
    const payment = await tx.payment.create({
      data: {
        billingCycleId: cycle.id,
        membershipId: membership.id,
        amount: group.pricePerSlot,
        status: PaymentStatus.PENDING,
        coveredFrom: cycle.periodEnd,
        coveredUntil: newPeriodEnd,
        forNextCycle: true,
        graceUntil: new Date(cycle.periodEnd.getTime() + GRACE_PERIOD_MS),
        // Este mismo aviso ya es el recordatorio de "3 días antes": no se repite.
        reminderStage: 1,
        reminderSentAt: new Date(),
      },
    });
    await this.notificationsService.create(tx, {
      userId: membership.userId,
      type: NotificationType.PAYMENT_DUE_SOON,
      groupId: membership.groupId,
      payload: `${intro} Tu lugar en "${group.plan.platform.name}" se renueva el ${this.dateLabel(cycle.periodEnd)}: transfiere $${group.pricePerSlot.toString()} y sube tu comprobante antes de esa fecha para seguir usando la cuenta el mes siguiente. Si no quieres renovar, desactiva la renovación automática desde el grupo.`,
      emailDedupeKey: `payment-reminder:${payment.id}:1`,
    });
  }

  /**
   * Genera el cobro de renovación de quien lo va a necesitar dentro de poco: cuando faltan 3 días o menos para el
   * corte de un grupo, a cada miembro ACTIVO con la renovación automática encendida. Quien la apagó nunca recibe
   * cobro: su lugar se libera al terminar el periodo. Devuelve cuántos cobros generó.
   */
  async generateRenewalCharges(now: Date = new Date()): Promise<number> {
    const cycles = await this.prisma.billingCycle.findMany({
      where: {
        status: BillingCycleStatus.OPEN,
        periodEnd: { gt: now, lte: new Date(now.getTime() + RENEWAL_WINDOW_MS) },
        group: { startedAt: { not: null }, status: { in: [GroupStatus.ACTIVE, GroupStatus.FULL] } },
      },
      include: { group: { include: { plan: { include: { platform: { select: { name: true } } } } } } },
    });

    let created = 0;
    for (const cycle of cycles) {
      const members = await this.prisma.groupMembership.findMany({
        where: {
          groupId: cycle.groupId,
          status: MembershipStatus.ACTIVE,
          autoRenew: true,
          payments: { none: { billingCycleId: cycle.id, forNextCycle: true } },
        },
      });
      for (const member of members) {
        await this.prisma.$transaction((tx) =>
          this.createRenewalCharge(tx, member, cycle, cycle.group, 'Ya puedes pagar tu renovación.'),
        );
        created += 1;
      }
    }
    if (created > 0) {
      this.logger.log(`Cobros de renovación generados: ${created}.`);
    }
    return created;
  }

  /**
   * Si el comprador vuelve a encender su renovación cuando ya se abrió la ventana de 3 días, se le genera el cobro
   * en ese momento (el proceso diario ya pasó y no se lo generaría a tiempo).
   */
  async ensureRenewalCharge(tx: Prisma.TransactionClient, membershipId: string): Promise<void> {
    const now = new Date();
    const membership = await tx.groupMembership.findUnique({
      where: { id: membershipId },
      include: { group: { include: { plan: { include: { platform: { select: { name: true } } } } } } },
    });
    if (!membership || membership.status !== MembershipStatus.ACTIVE || !membership.group.startedAt) {
      return;
    }
    const cycle = await tx.billingCycle.findFirst({ where: { groupId: membership.groupId, status: BillingCycleStatus.OPEN } });
    if (!cycle || cycle.periodEnd <= now || cycle.periodEnd.getTime() - now.getTime() > RENEWAL_WINDOW_MS) {
      return;
    }
    const exists = await tx.payment.findFirst({ where: { membershipId, billingCycleId: cycle.id, forNextCycle: true }, select: { id: true } });
    if (exists) {
      return;
    }
    await this.createRenewalCharge(tx, membership, cycle, membership.group, 'Reactivaste tu renovación.');
  }

  /**
   * Al apagar la renovación se retira el cobro del ciclo siguiente que aún no se paga. Si ya lo pagó, el lugar ya
   * es suyo para el mes que viene y no se puede apagar hasta el siguiente ciclo; si ya subió su comprobante, hay
   * que esperar a que el vendedor lo revise.
   */
  async cancelRenewalCharge(tx: Prisma.TransactionClient, membershipId: string): Promise<void> {
    const charge = await tx.payment.findFirst({
      where: { membershipId, forNextCycle: true, billingCycle: { status: BillingCycleStatus.OPEN } },
      orderBy: { billingCycle: { periodEnd: 'desc' } },
    });
    if (!charge) {
      return;
    }
    if (charge.status === PaymentStatus.PAID) {
      throw new BadRequestException('Ya pagaste tu renovación: tu lugar está asegurado para el mes que viene. Podrás desactivarla en el siguiente ciclo.');
    }
    if (charge.status === PaymentStatus.PENDING) {
      if (charge.receiptPath) {
        throw new BadRequestException('Ya subiste tu comprobante de renovación. Espera a que el vendedor lo revise antes de cambiar esta opción.');
      }
      await tx.payment.delete({ where: { id: charge.id } });
    }
  }

  /**
   * Cuando termina el periodo de quien no renovó, su lugar pasa a quien lo había apartado (el más antiguo primero):
   * se le genera el pago del ciclo completo con 48 horas para cubrirlo, igual que al iniciar un grupo. Corre
   * después de liberar lugares y antes de cerrar el ciclo.
   */
  private async promoteReservedSeats(): Promise<void> {
    const now = new Date();
    const cycles = await this.prisma.billingCycle.findMany({
      where: {
        status: BillingCycleStatus.OPEN,
        periodEnd: { lte: now },
        group: { startedAt: { not: null }, memberships: { some: { status: MembershipStatus.RESERVED } } },
      },
      include: { group: { include: { plan: { include: { platform: { select: { name: true } } } } } } },
    });

    for (const cycle of cycles) {
      const group = cycle.group;
      const platform = group.plan.platform.name;
      await this.prisma.$transaction(async (tx) => {
        const taken = await tx.groupMembership.count({
          where: { groupId: group.id, status: { in: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED, MembershipStatus.PENDING_PAYMENT] } },
        });
        const free = group.availableSlots - taken;
        if (free <= 0) {
          return;
        }
        const waiting = await tx.groupMembership.findMany({
          where: { groupId: group.id, status: MembershipStatus.RESERVED },
          orderBy: { joinedAt: 'asc' },
          take: free,
        });
        const newPeriodEnd = addBillingPeriod(cycle.periodEnd, group.plan.billingPeriod);
        for (const membership of waiting) {
          await tx.groupMembership.update({
            where: { id: membership.id },
            data: { status: MembershipStatus.PENDING_PAYMENT, currentPeriodEnd: newPeriodEnd },
          });
          const payment = await tx.payment.create({
            data: {
              billingCycleId: cycle.id,
              membershipId: membership.id,
              amount: group.pricePerSlot,
              status: PaymentStatus.PENDING,
              coveredFrom: cycle.periodEnd,
              coveredUntil: newPeriodEnd,
              forNextCycle: true,
              graceUntil: new Date(now.getTime() + FIRST_PAYMENT_WINDOW_MS),
            },
          });
          await this.notificationsService.create(tx, {
            userId: membership.userId,
            type: NotificationType.PAYMENT_DUE_SOON,
            groupId: group.id,
            payload: `¡Se liberó el lugar que apartaste en el grupo de ${platform}! Transfiere $${group.pricePerSlot.toString()} y sube tu comprobante antes del ${this.dateLabel(payment.graceUntil!)} para quedarte con él.`,
            emailDedupeKey: `seat-freed:${membership.id}`,
            emailImmediate: true,
          });
          await this.notificationsService.create(tx, {
            userId: group.ownerId,
            type: NotificationType.SYSTEM,
            groupId: group.id,
            payload: `Se liberó un lugar en tu grupo de ${platform} y ya lo tomó un nuevo comprador. Cuando suba su comprobante, apruébalo y asígnale un perfil.`,
          });
        }
        this.logger.log(`Grupo ${group.id}: ${waiting.length} lugar(es) liberado(s) pasaron a quien los tenía apartados.`);
      });
    }
  }

  private async findOwnPendingPayment(groupId: string, requesterUserId: string) {
    const membership = await this.prisma.groupMembership.findFirst({
      where: { groupId, userId: requesterUserId, status: { in: [MembershipStatus.ACTIVE, MembershipStatus.PENDING_PAYMENT] } },
      include: { user: true, group: { include: { plan: { include: { platform: true } } } } },
    });
    if (!membership) {
      throw new NotFoundException('No tienes una membresía activa en este grupo.');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { membershipId: membership.id, status: PaymentStatus.PENDING },
      orderBy: { billingCycle: { periodEnd: 'desc' } },
    });
    if (!payment) {
      throw new NotFoundException('No tienes ningún pago pendiente en este grupo.');
    }

    return { payment, membership };
  }

  /** El miembro sube su comprobante (captura/PDF) — el pago se queda PENDING hasta que el owner lo revise. */
  async uploadReceipt(groupId: string, requesterUserId: string, file: Express.Multer.File): Promise<PaymentResponseDto> {
    const extension = EXTENSION_BY_MIMETYPE[file.mimetype];
    if (!extension) {
      throw new BadRequestException('Solo se aceptan comprobantes en JPG, PNG, WEBP o PDF.');
    }
    if (!receiptMatchesType(file.buffer, file.mimetype)) {
      throw new BadRequestException('El archivo no parece una imagen o un PDF válido. Sube la captura o el PDF original de tu transferencia.');
    }

    const { payment, membership } = await this.findOwnPendingPayment(groupId, requesterUserId);

    const filename = buildReceiptFilename(membership.user.name, membership.group.plan.platform.name, new Date(), extension);
    await saveReceiptFile(this.receiptsDir, filename, file.buffer);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payment.update({
        where: { id: payment.id },
        data: { receiptPath: filename, receiptUploadedAt: new Date() },
      });
      await this.notificationsService.create(tx, {
        userId: membership.group.ownerId,
        groupId,
        type: NotificationType.PAYMENT_RECEIPT_UPLOADED,
        payload: `${membership.user.name} subió un comprobante de pago por $${payment.amount.toString()}. Revísalo cuando puedas.`,
      });
      return result;
    });

    return new PaymentResponseDto(updated);
  }

  /** El propio comprador ve su pago pendiente en este grupo: monto a transferir y si ya subió comprobante. */
  async findMine(groupId: string, requesterUserId: string): Promise<PaymentResponseDto | null> {
    const membership = await this.prisma.groupMembership.findFirst({
      where: { groupId, userId: requesterUserId, status: { in: [MembershipStatus.ACTIVE, MembershipStatus.PENDING_PAYMENT] } },
    });
    if (!membership) {
      throw new NotFoundException('No tienes una membresía activa o pendiente en este grupo.');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { membershipId: membership.id, status: PaymentStatus.PENDING },
      orderBy: { billingCycle: { periodEnd: 'desc' } },
    });
    return payment ? new PaymentResponseDto(payment) : null;
  }

  /** Solo el owner del grupo (o un ADMIN) puede ver la cola de pagos pendientes a revisar. */
  async findPending(groupId: string, requester: AuthenticatedUser, query: ListPendingPaymentsQueryDto) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    if (group.ownerId !== requester.id && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo el owner de este grupo (o un ADMIN) puede ver los pagos pendientes.');
    }

    const where: Prisma.PaymentWhereInput = {
      status: PaymentStatus.PENDING,
      membership: { groupId },
      ...(query.onlyWithReceipt ? { receiptPath: { not: null } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: WITH_MEMBER,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { graceUntil: 'asc' },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, total };
  }

  /** Aprueba (acredita al owner, igual que antes) o rechaza (borra el comprobante y avisa por qué) — owner o ADMIN. */
  async reviewReceipt(groupId: string, paymentId: string, dto: ReviewPaymentReceiptDto, requester: AuthenticatedUser) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId }, include: { plan: true } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    if (group.ownerId !== requester.id) {
      throw new ForbiddenException('Solo el vendedor de este grupo puede revisar comprobantes.');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, membership: { groupId } },
      include: WITH_MEMBER,
    });
    if (!payment) {
      throw new NotFoundException('Pago no encontrado en este grupo.');
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(`Este pago ya está en estado ${payment.status}, no hay nada que revisar.`);
    }
    if (!payment.receiptPath) {
      throw new BadRequestException('Este pago todavía no tiene un comprobante subido.');
    }

    if (dto.approve) {
      const updated = await this.prisma.$transaction(async (tx) => {
        // updateMany (no update) a propósito: al filtrar también por status: PENDING, Postgres
        // hace que una segunda revisión concurrente del mismo pago (doble clic, reintento de
        // red) espere a que la primera confirme y luego afecte 0 filas, en vez de acreditar el
        // wallet del vendedor dos veces por el mismo comprobante.
        const paymentUpdateResult = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.PAID, paidAt: new Date() },
        });
        if (paymentUpdateResult.count === 0) {
          throw new BadRequestException('Este pago ya fue revisado por otra solicitud.');
        }
        const paid = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });

        // Primer pago aprobado de esta membresía: la pasa de PENDING_PAYMENT a ACTIVE,
        // lo que desbloquea la credencial (getCredential exige ACTIVE). En renovaciones ya
        // estará ACTIVE, así que este update es un no-op inofensivo.
        if (payment.membership.status === MembershipStatus.PENDING_PAYMENT) {
          if (!dto.profileId) {
            throw new BadRequestException('Debes asignarle un perfil de la cuenta compartida antes de aprobar su primer pago.');
          }
          const profile = await tx.groupProfile.findFirst({ where: { id: dto.profileId, groupId: group.id } });
          if (!profile) {
            throw new NotFoundException('Ese perfil no existe en este grupo.');
          }
          if (profile.assignedMembershipId) {
            throw new BadRequestException('Ese perfil ya está asignado a otro miembro. Elige uno libre.');
          }
          // Mismo motivo que arriba: el where con assignedMembershipId: null evita que dos
          // aprobaciones concurrentes le den el mismo perfil a dos miembros distintos.
          const profileUpdateResult = await tx.groupProfile.updateMany({
            where: { id: profile.id, assignedMembershipId: null },
            data: { assignedMembershipId: payment.membership.id },
          });
          if (profileUpdateResult.count === 0) {
            throw new BadRequestException('Ese perfil ya está asignado a otro miembro. Elige uno libre.');
          }

          await tx.groupMembership.update({
            where: { id: payment.membership.id },
            data: { status: MembershipStatus.ACTIVE },
          });

          // El primer pago confirmado es el momento en que el comprador ocupa realmente
          // un cupo y comienza a mostrarse como miembro en el marketplace y su panel.
          const updatedGroup = await tx.group.update({
            where: { id: group.id },
            data: { occupiedSlots: { increment: 1 } },
          });
          if (updatedGroup.occupiedSlots >= updatedGroup.availableSlots) {
            await tx.group.update({ where: { id: group.id }, data: { status: GroupStatus.FULL } });
          }
        }

        // El dinero ya cayó directo a la cuenta del vendedor: aquí solo se anota cuánto fue
        // suyo y cuánto es comisión de Partly (que el vendedor transfiere aparte).
        await this.commissionsService.recordEarning(tx, {
          paymentId: paid.id,
          sellerId: group.ownerId,
          groupId: group.id,
          billingCycleId: paid.billingCycleId,
          gross: Number(paid.amount),
          // El ADMIN asigna el % al aprobar el grupo (ver GroupsService.reviewApproval); el
          // % del Plan solo queda de respaldo para grupos aprobados antes de este cambio.
          commissionPercentage: Number(group.commissionPercentage ?? group.plan.commissionPercentage),
        });
        await this.commissionsService.billDueEntries(tx, group.ownerId);

        await this.notificationsService.create(tx, {
          userId: payment.membership.userId,
          groupId: group.id,
          type: NotificationType.PAYMENT_CONFIRMED,
          payload: `Tu pago de $${payment.amount.toString()} fue confirmado.`,
        });

        return paid;
      });

      return new PaymentResponseDto(updated);
    }

    // Rechazo: el pago se queda PENDING para que puedan volver a subir uno correcto. Igual que
    // en la aprobación, updateMany + where status: PENDING evita pisar un pago que una
    // aprobación concurrente ya haya marcado PAID (lo que dejaría el archivo borrado pero el
    // pago aprobado, o viceversa). El archivo solo se borra del disco después de que la
    // transacción confirma, no antes — así nunca queda una referencia a un archivo que ya no existe.
    const updated = await this.prisma.$transaction(async (tx) => {
      const rejectResult = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { receiptPath: null, receiptUploadedAt: null },
      });
      if (rejectResult.count === 0) {
        throw new BadRequestException('Este pago ya fue revisado por otra solicitud.');
      }
      await this.notificationsService.create(tx, {
        userId: payment.membership.userId,
        groupId: group.id,
        type: NotificationType.PAYMENT_RECEIPT_REJECTED,
        payload: dto.reason
          ? `Tu comprobante fue rechazado: ${dto.reason}. Sube uno nuevo.`
          : 'Tu comprobante fue rechazado. Sube uno nuevo.',
      });
      return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    });

    await deleteReceiptFile(this.receiptsDir, payment.receiptPath!);
    return new PaymentResponseDto(updated);
  }

  /** Owner, el miembro dueño del pago, o un ADMIN pueden volver a ver el comprobante subido. */
  async getReceiptFilePath(groupId: string, paymentId: string, requester: AuthenticatedUser): Promise<{ absolutePath: string; filename: string }> {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, membership: { groupId } },
      include: WITH_MEMBER,
    });
    if (!payment) {
      throw new NotFoundException('Pago no encontrado en este grupo.');
    }

    const isOwner = group.ownerId === requester.id;
    const isPayer = payment.membership.userId === requester.id;
    if (!isOwner && !isPayer && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('No tienes acceso a este comprobante.');
    }
    if (!payment.receiptPath) {
      throw new NotFoundException('Este pago todavía no tiene un comprobante subido.');
    }

    return { absolutePath: resolveReceiptPath(this.receiptsDir, payment.receiptPath), filename: payment.receiptPath };
  }

  /**
   * Corre una vez al día: revoca a quien no pagó dentro de las 48h de gracia, libera el lugar de quien no renovó
   * (y se lo da a quien lo apartó), avanza los ciclos de facturación que ya cerraron, genera el cobro de
   * renovación 3 días antes del corte, avisa a quien le toca pagar, y borra comprobantes viejos.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processDailyBilling(): Promise<void> {
    await this.expireOverdueSuspensions();
    await this.endNonRenewingMemberships();
    await this.promoteReservedSeats();
    await this.rolloverClosedCycles();
    await this.generateRenewalCharges();
    await this.sendPaymentReminders();
    await this.cleanupOldReceipts();
  }

  private async expireOverdueSuspensions(): Promise<void> {
    const now = new Date();
    const overdue = await this.prisma.payment.findMany({
      // Quien ya subió su comprobante cumplió: ahora le toca al vendedor revisarlo, y esa demora no le cuesta el lugar.
      where: { status: PaymentStatus.PENDING, graceUntil: { lt: now }, receiptPath: null },
      include: { membership: true },
    });

    for (const payment of overdue) {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } });

        const membership = await tx.groupMembership.update({
          where: { id: payment.membershipId },
          data: { status: MembershipStatus.CANCELLED, leftAt: now },
        });
        // Libera su perfil de la cuenta compartida para que quede disponible para el siguiente comprador.
        await tx.groupProfile.updateMany({ where: { assignedMembershipId: payment.membershipId }, data: { assignedMembershipId: null } });

        // El primer pago pendiente nunca ocupó un cupo. En renovaciones la membresía ya
        // estaba ACTIVE, así que solo en ese caso hay que liberar el lugar confirmado.
        if (payment.membership.status === MembershipStatus.ACTIVE || payment.membership.status === MembershipStatus.SUSPENDED) {
          const group = await tx.group.findUniqueOrThrow({ where: { id: membership.groupId } });
          const occupiedSlots = Math.max(0, group.occupiedSlots - 1);
          await tx.group.update({
            where: { id: group.id },
            data: {
              occupiedSlots,
              status: group.status === GroupStatus.FULL ? GroupStatus.ACTIVE : group.status,
            },
          });
        }

        await this.notificationsService.create(tx, {
          userId: membership.userId,
          type: NotificationType.MEMBERSHIP_CANCELLED,
          groupId: membership.groupId,
          payload: 'Se te removió del grupo por no confirmar tu pago dentro de las 48 horas de gracia.',
        });
      });

      this.logger.log(`Membresía ${payment.membershipId} cancelada por falta de pago (gracia vencida).`);
    }
  }

  /**
   * Quien apagó su renovación automática ("solo quería probar") conserva su lugar hasta que termina el periodo que
   * ya pagó; después su membresía se cierra, el perfil de la cuenta y el cupo quedan libres y no se le genera un
   * cobro nuevo. Corre antes del cierre de ciclos, así que ya no cuenta como miembro para la renovación.
   */
  private async endNonRenewingMemberships(): Promise<void> {
    const now = new Date();
    const ending = await this.prisma.groupMembership.findMany({
      where: { status: MembershipStatus.ACTIVE, autoRenew: false, currentPeriodEnd: { lte: now } },
      include: {
        user: { select: { name: true } },
        group: { include: { plan: { include: { platform: { select: { name: true } } } } } },
      },
    });

    for (const membership of ending) {
      const platform = membership.group.plan.platform.name;
      await this.prisma.$transaction(async (tx) => {
        await tx.groupMembership.update({ where: { id: membership.id }, data: { status: MembershipStatus.CANCELLED, leftAt: now } });
        await tx.groupProfile.updateMany({ where: { assignedMembershipId: membership.id }, data: { assignedMembershipId: null } });
        const group = await tx.group.findUniqueOrThrow({ where: { id: membership.groupId } });
        await tx.group.update({
          where: { id: group.id },
          data: {
            occupiedSlots: Math.max(0, group.occupiedSlots - 1),
            status: group.status === GroupStatus.FULL ? GroupStatus.ACTIVE : group.status,
          },
        });
        await this.notificationsService.create(tx, {
          userId: membership.userId,
          type: NotificationType.MEMBERSHIP_CANCELLED,
          payload: `Terminó tu periodo en el grupo de ${platform}. Como desactivaste la renovación, tu lugar quedó libre y ya no se te cobrará. Si quieres volver, puedes entrar de nuevo cuando quieras.`,
          groupId: membership.groupId,
        });
        await this.notificationsService.create(tx, {
          userId: membership.group.ownerId,
          type: NotificationType.SYSTEM,
          payload: `${membership.user.name} terminó su periodo y no renovó. Su lugar en tu grupo de ${platform} quedó libre.`,
          groupId: membership.groupId,
        });
      });
      this.logger.log(`Membresía ${membership.id} cerrada al terminar su periodo (sin renovación).`);
    }
  }

  private async rolloverClosedCycles(): Promise<void> {
    const now = new Date();
    const readyToClose = await this.prisma.billingCycle.findMany({
      where: { status: BillingCycleStatus.OPEN, periodEnd: { lte: new Date(now.getTime() - GRACE_PERIOD_MS) } },
      include: { group: { include: { plan: true } } },
    });

    for (const cycle of readyToClose) {
      await this.prisma.$transaction(async (tx) => {
        await tx.billingCycle.update({ where: { id: cycle.id }, data: { status: BillingCycleStatus.CLOSED } });

        const newPeriodEnd = addBillingPeriod(cycle.periodEnd, cycle.group.plan.billingPeriod);
        await tx.group.update({ where: { id: cycle.groupId }, data: { nextRenewalDate: newPeriodEnd } });

        const newCycle = await tx.billingCycle.create({
          data: {
            groupId: cycle.groupId,
            periodStart: cycle.periodEnd,
            periodEnd: newPeriodEnd,
            status: BillingCycleStatus.OPEN,
          },
        });

        // Solo quienes siguen ACTIVE llegaron vivos hasta aquí (a quien no pagó ya lo
        // removimos en expireOverdueSuspensions, que siempre corre antes en la misma corrida).
        const activeMemberships = await tx.groupMembership.findMany({
          where: { groupId: cycle.groupId, status: MembershipStatus.ACTIVE },
        });

        // Quien apartó un lugar que finalmente no se liberó (por ejemplo, porque el miembro volvió a renovar).
        const orphanReservations = await tx.groupMembership.findMany({
          where: { groupId: cycle.groupId, status: MembershipStatus.RESERVED },
        });
        for (const reservation of orphanReservations) {
          await tx.groupMembership.update({ where: { id: reservation.id }, data: { status: MembershipStatus.CANCELLED, leftAt: now } });
          await this.notificationsService.create(tx, {
            userId: reservation.userId,
            type: NotificationType.MEMBERSHIP_CANCELLED,
            groupId: cycle.groupId,
            payload: 'El lugar que apartaste finalmente no se liberó porque el miembro renovó. Tu reserva se canceló sin costo; puedes buscar otro grupo.',
          });
        }

        for (const membership of activeMemberships) {
          // Quien entró con muy pocos días restantes ya pagó por adelantado este ciclo
          // (Payment.includesNextCycle): no se le vuelve a cobrar, solo se le sigue la cuenta.
          const alreadyPrepaid = await tx.payment.findFirst({
            where: {
              billingCycleId: cycle.id,
              membershipId: membership.id,
              OR: [
                { includesNextCycle: true, status: PaymentStatus.PAID },
                // Renovación cobrada por adelantado (ya pagada, o esperando comprobante dentro de su plazo).
                { forNextCycle: true, status: { in: [PaymentStatus.PAID, PaymentStatus.PENDING] } },
              ],
            },
            select: { id: true },
          });
          if (alreadyPrepaid) {
            await tx.groupMembership.update({ where: { id: membership.id }, data: { currentPeriodEnd: newPeriodEnd } });
            continue;
          }
          await tx.payment.create({
            data: {
              billingCycleId: newCycle.id,
              membershipId: membership.id,
              amount: cycle.group.pricePerSlot,
              status: PaymentStatus.PENDING,
              coveredFrom: newCycle.periodStart,
              coveredUntil: newPeriodEnd,
              graceUntil: new Date(newPeriodEnd.getTime() + GRACE_PERIOD_MS),
            },
          });
          await tx.groupMembership.update({ where: { id: membership.id }, data: { currentPeriodEnd: newPeriodEnd } });
        }
      });

      this.logger.log(`Ciclo de facturación del grupo ${cycle.groupId} avanzado a ${cycle.periodEnd.toISOString()} -> siguiente periodo.`);
    }
  }

  private dateLabel(date: Date): string {
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' });
  }

  /**
   * Recordatorios automáticos al comprador que todavía no sube su comprobante. Cada uno sale una
   * sola vez (Payment.reminderStage) y llega también por correo:
   *  - primer pago (48h desde que se genera): un aviso cuando falta menos de un día.
   *  - renovación: 3 días antes de la fecha de corte, el día del corte, y ya vencido mientras
   *    dura la gracia (último aviso antes de perder el cupo).
   * Quien ya subió su comprobante no recibe nada: ahora le toca al vendedor revisarlo.
   */
  async sendPaymentReminders(): Promise<number> {
    const now = new Date();
    const pending = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.PENDING,
        receiptPath: null,
        graceUntil: { gt: now },
        membership: { status: { in: [MembershipStatus.ACTIVE, MembershipStatus.PENDING_PAYMENT] } },
      },
      include: { membership: { include: { group: { include: { plan: { include: { platform: { select: { name: true } } } } } } } }, billingCycle: true },
    });

    let sent = 0;
    for (const payment of pending) {
      const isFirstPayment = payment.membership.status === MembershipStatus.PENDING_PAYMENT;
      const platform = payment.membership.group.plan.platform.name;
      const amount = `$${payment.amount.toString()}`;
      const deadline = payment.graceUntil!;
      let stage = 0;
      let payload = '';

      if (isFirstPayment) {
        if (deadline.getTime() - now.getTime() <= DAY_MS) {
          stage = 1;
          payload = `Te queda menos de un día para pagar ${amount} de "${platform}". Transfiere y sube tu comprobante antes del ${this.dateLabel(deadline)} o se liberará tu lugar.`;
        }
      } else {
        const due = payment.billingCycle.periodEnd;
        if (now.getTime() >= due.getTime()) {
          stage = 3;
          payload = `Tu pago de ${amount} de "${platform}" ya venció. Tienes hasta el ${this.dateLabel(deadline)} para subir tu comprobante; después perderás tu lugar en el grupo.`;
        } else {
          const daysLeft = Math.ceil((due.getTime() - now.getTime()) / DAY_MS);
          if (daysLeft <= 1) {
            stage = 2;
            payload = `Tu renovación de ${amount} de "${platform}" vence hoy o mañana (${this.dateLabel(due)}). Sube tu comprobante para no perder tu lugar.`;
          } else if (daysLeft <= 3) {
            stage = 1;
            payload = `Tu renovación de ${amount} de "${platform}" vence el ${this.dateLabel(due)}. Transfiere a tiempo y sube tu comprobante.`;
          }
        }
      }
      if (stage === 0 || stage <= payment.reminderStage) continue;

      await this.prisma.$transaction(async (tx) => {
        await this.notificationsService.create(tx, {
          userId: payment.membership.userId,
          type: NotificationType.PAYMENT_DUE_SOON,
          payload,
          groupId: payment.membership.groupId,
          emailDedupeKey: `payment-reminder:${payment.id}:${stage}`,
        });
        await tx.payment.update({ where: { id: payment.id }, data: { reminderStage: stage, reminderSentAt: now } });
      });
      sent += 1;
    }
    if (sent > 0) {
      this.logger.log(`Recordatorios de pago enviados: ${sent}.`);
    }
    return sent;
  }

  /**
   * Botón "Enviar recordatorio" del admin en Pagos y comprobantes. Si el comprador todavía no sube
   * su comprobante se lo recuerda a él; si ya lo subió, se lo recuerda al vendedor que debe revisarlo.
   * Máximo uno por persona al día. Sale por la app y por correo, sin esperar a la mañana.
   */
  async sendManualReminder(paymentId: string, admin: AuthenticatedUser) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        membership: {
          include: {
            user: { select: { id: true, name: true, emailNotifications: true, inAppNotifications: true } },
            group: {
              include: {
                plan: { include: { platform: { select: { name: true } } } },
                owner: { select: { id: true, name: true, emailNotifications: true, inAppNotifications: true } },
              },
            },
          },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException('Pago no encontrado.');
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Este pago ya no está pendiente: no hay nada que recordar.');
    }

    const toSeller = payment.receiptPath !== null;
    const target = toSeller ? payment.membership.group.owner : payment.membership.user;
    const today = dayKey(new Date());
    const already = await this.prisma.adminActionLog.findFirst({ where: { actionType: 'MANUAL_REMINDER', targetId: target.id, reason: today } });
    if (already) {
      throw new ConflictException(`Ya le enviaste un recordatorio a ${target.name} hoy. Vuelve a intentarlo mañana.`);
    }

    const platform = payment.membership.group.plan.platform.name;
    const amount = `$${payment.amount.toString()}`;
    const payload = toSeller
      ? `Recordatorio de Partly: ${payment.membership.user.name} subió su comprobante de ${amount} de "${platform}" y sigue esperando tu revisión. Apruébalo para activar su lugar.`
      : `Recordatorio de Partly: tu pago de ${amount} de "${platform}"${payment.graceUntil ? ` vence el ${this.dateLabel(payment.graceUntil)}` : ' está pendiente'}. Transfiere y sube tu comprobante para conservar tu lugar.`;

    await this.prisma.$transaction(async (tx) => {
      await this.notificationsService.create(tx, {
        userId: target.id,
        type: toSeller ? NotificationType.PAYMENT_RECEIPT_UPLOADED : NotificationType.PAYMENT_DUE_SOON,
        payload,
        groupId: payment.membership.groupId,
        emailDedupeKey: `manual-reminder:${target.id}:${today}`,
        emailImmediate: true,
      });
      await tx.adminActionLog.create({ data: { adminUserId: admin.id, actionType: 'MANUAL_REMINDER', targetEntity: 'Payment', targetId: target.id, reason: today } });
    });

    return { sentTo: toSeller ? ('SELLER' as const) : ('BUYER' as const), name: target.name, inApp: target.inAppNotifications, email: target.emailNotifications };
  }

  /** Borra del disco los comprobantes más viejos que RECEIPTS_RETENTION_DAYS, para no llenar el servidor. */
  private async cleanupOldReceipts(): Promise<void> {
    const retentionDays = this.configService.get<number>('receipts.retentionDays')!;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const old = await this.prisma.payment.findMany({
      where: { receiptPath: { not: null }, receiptUploadedAt: { lt: cutoff } },
      select: { id: true, receiptPath: true },
    });

    for (const payment of old) {
      await deleteReceiptFile(this.receiptsDir, payment.receiptPath!);
      await this.prisma.payment.update({ where: { id: payment.id }, data: { receiptPath: null } });
    }

    if (old.length > 0) {
      this.logger.log(`Limpieza de comprobantes: ${old.length} archivo(s) con más de ${retentionDays} días eliminados.`);
    }
  }
}
