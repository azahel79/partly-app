import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  GroupApprovalStatus,
  GroupStatus,
  IncidentStatus,
  NotificationType,
  PaymentStatus,
  Prisma,
  ProviderOrderStatus,
  Role,
  WholesaleAccessStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { CommissionsService } from '../commissions/commissions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MIN_ACTIVE_GROUP_CYCLES, MIN_RATING, MIN_REVIEWS, SUGGESTED_MONTHLY_CAP } from './wholesale.constants';
import { ListWholesaleAccessQueryDto } from './dto/list-wholesale-access-query.dto';
import { ReviewWholesaleAccessDto } from './dto/review-wholesale-access.dto';

export interface WholesaleRequirement {
  key: 'email' | 'phone' | 'group' | 'reviews' | 'rating' | 'incidents' | 'commission';
  label: string;
  hint: string;
  met: boolean;
  /** Avance hacia la meta, para pintar la barra (ej. 1 de 2 ciclos). */
  current: number;
  target: number;
}

/** Órdenes que cuentan contra el tope mensual: cuentas nuevas, no renovaciones ni reposiciones. */
const CAP_STATUSES: ProviderOrderStatus[] = [
  ProviderOrderStatus.AWAITING_PAYMENT,
  ProviderOrderStatus.PENDING_APPROVAL,
  ProviderOrderStatus.PENDING_DELIVERY,
  ProviderOrderStatus.FULFILLED,
];

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Comprar al mayoreo no es para cualquiera: hay que demostrar que se sabe llevar un grupo. El
 * vendedor ve qué le falta, pide acceso cuando cumple y el admin lo autoriza (con un tope
 * mensual para los recién autorizados).
 */
@Injectable()
export class WholesaleAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commissionsService: CommissionsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ------------------------------------------------------------------ requisitos

  async evaluate(userId: string): Promise<{ requirements: WholesaleRequirement[]; metCount: number; total: number; allMet: boolean }> {
    const [user, groups, reviews, escalated, restriction] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { emailVerified: true, phone: true } }),
      this.prisma.group.findMany({
        where: { ownerId: userId, approvalStatus: GroupApprovalStatus.APPROVED, status: { in: [GroupStatus.ACTIVE, GroupStatus.FULL] } },
        select: { id: true },
      }),
      this.prisma.review.aggregate({ where: { group: { ownerId: userId } }, _avg: { rating: true }, _count: true }),
      this.prisma.incident.count({ where: { status: IncidentStatus.ESCALATED, groupMembership: { group: { ownerId: userId } } } }),
      this.commissionsService.getRestriction(userId),
    ]);

    // Ciclos que de verdad se cobraron (con al menos un pago validado) en el mejor de sus grupos activos.
    const chargedCycles = groups.length
      ? await this.prisma.billingCycle.findMany({
          where: { groupId: { in: groups.map((g) => g.id) }, payments: { some: { status: PaymentStatus.PAID } } },
          select: { groupId: true },
        })
      : [];
    const cyclesByGroup = new Map<string, number>();
    for (const cycle of chargedCycles) {
      cyclesByGroup.set(cycle.groupId, (cyclesByGroup.get(cycle.groupId) ?? 0) + 1);
    }
    const bestCycles = Math.max(0, ...cyclesByGroup.values());

    const reviewCount = reviews._count;
    const rating = round2(reviews._avg.rating ?? 0);

    const requirements: WholesaleRequirement[] = [
      { key: 'email', label: 'Correo verificado', hint: 'Confirma tu correo desde tu perfil.', met: user.emailVerified, current: user.emailVerified ? 1 : 0, target: 1 },
      { key: 'phone', label: 'Teléfono registrado', hint: 'Agrégalo en tu perfil para que podamos contactarte.', met: Boolean(user.phone?.trim()), current: user.phone?.trim() ? 1 : 0, target: 1 },
      {
        key: 'group',
        label: `Un grupo activo con ${MIN_ACTIVE_GROUP_CYCLES} ciclos cobrados`,
        hint: 'Crea un grupo con una cuenta tuya: es la forma de construir reputación antes de comprar al mayoreo.',
        met: bestCycles >= MIN_ACTIVE_GROUP_CYCLES,
        current: Math.min(bestCycles, MIN_ACTIVE_GROUP_CYCLES),
        target: MIN_ACTIVE_GROUP_CYCLES,
      },
      {
        key: 'reviews',
        label: `Al menos ${MIN_REVIEWS} reseñas de tus compradores`,
        hint: 'Tus compradores dejan su reseña desde el detalle del grupo.',
        met: reviewCount >= MIN_REVIEWS,
        current: Math.min(reviewCount, MIN_REVIEWS),
        target: MIN_REVIEWS,
      },
      {
        key: 'rating',
        label: `Calificación promedio de ${MIN_RATING} o más`,
        hint: 'Se calcula con las reseñas de todos tus grupos.',
        met: reviewCount >= MIN_REVIEWS && rating >= MIN_RATING,
        current: reviewCount >= MIN_REVIEWS ? rating : 0,
        target: MIN_RATING,
      },
      { key: 'incidents', label: 'Sin incidencias graves abiertas', hint: 'Resuelve con soporte las incidencias escaladas de tus grupos.', met: escalated === 0, current: escalated === 0 ? 1 : 0, target: 1 },
      { key: 'commission', label: 'Comisión al corriente', hint: 'Paga tu comisión vencida en la sección Comisiones.', met: !restriction.restricted, current: restriction.restricted ? 0 : 1, target: 1 },
    ];

    const metCount = requirements.filter((r) => r.met).length;
    return { requirements, metCount, total: requirements.length, allMet: metCount === requirements.length };
  }

  // ------------------------------------------------------------------ lo que ve el vendedor

  private monthStart(): Date {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    return start;
  }

  async usedThisMonth(userId: string): Promise<number> {
    return this.prisma.providerOrder.count({
      where: {
        buyerUserId: userId,
        renewsOrderId: null,
        replacesOrderId: null,
        status: { in: CAP_STATUSES },
        createdAt: { gte: this.monthStart() },
      },
    });
  }

  async getMine(userId: string) {
    const [access, evaluation, used] = await Promise.all([
      this.prisma.wholesaleAccess.findUnique({ where: { userId } }),
      this.evaluate(userId),
      this.usedThisMonth(userId),
    ]);
    const status = access?.status ?? null;
    return {
      status,
      authorized: status === WholesaleAccessStatus.AUTHORIZED,
      monthlyCap: access?.monthlyCap ?? null,
      usedThisMonth: used,
      note: access?.note ?? null,
      requestedAt: access?.requestedAt ?? null,
      requirements: evaluation.requirements,
      metCount: evaluation.metCount,
      total: evaluation.total,
      canRequest: evaluation.allMet && status !== WholesaleAccessStatus.AUTHORIZED && status !== WholesaleAccessStatus.REQUESTED && status !== WholesaleAccessStatus.REVOKED,
    };
  }

  async request(userId: string) {
    const [access, evaluation] = await Promise.all([this.prisma.wholesaleAccess.findUnique({ where: { userId } }), this.evaluate(userId)]);
    if (access?.status === WholesaleAccessStatus.AUTHORIZED) {
      throw new BadRequestException('Ya tienes acceso al mayoreo.');
    }
    if (access?.status === WholesaleAccessStatus.REQUESTED) {
      throw new BadRequestException('Tu solicitud ya está en revisión.');
    }
    if (access?.status === WholesaleAccessStatus.REVOKED) {
      throw new ForbiddenException('Tu acceso al mayoreo fue retirado. Escribe a soporte para revisarlo.');
    }
    if (!evaluation.allMet) {
      throw new BadRequestException('Todavía no cumples todos los requisitos para pedir acceso al mayoreo.');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
    const admins = await this.prisma.user.findMany({ where: { role: Role.ADMIN, deletedAt: null }, select: { id: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.wholesaleAccess.upsert({
        where: { userId },
        create: { userId, status: WholesaleAccessStatus.REQUESTED, requestedAt: new Date() },
        update: { status: WholesaleAccessStatus.REQUESTED, requestedAt: new Date(), note: null },
      });
      for (const admin of admins) {
        await this.notificationsService.create(tx, {
          userId: admin.id,
          type: NotificationType.WHOLESALE_ACCESS_REQUESTED,
          payload: `${user.name} cumple los requisitos y pidió acceso al mayoreo. Revisa su reputación y autorízalo si procede.`,
        });
      }
    });
    return this.getMine(userId);
  }

  // ------------------------------------------------------------------ candado al comprar

  /** Solo quien tiene acceso autorizado puede comprar; los recién autorizados tienen un tope por mes. */
  async assertCanPurchase(userId: string, options: { countsForCap: boolean }): Promise<void> {
    const access = await this.prisma.wholesaleAccess.findUnique({ where: { userId } });
    if (access?.status !== WholesaleAccessStatus.AUTHORIZED) {
      throw new ForbiddenException('El mayoreo es solo para vendedores con reputación. Revisa en Mayoreo qué te falta y pide acceso.');
    }
    if (options.countsForCap && access.monthlyCap !== null) {
      const used = await this.usedThisMonth(userId);
      if (used >= access.monthlyCap) {
        throw new ForbiddenException(`Alcanzaste tu tope de ${access.monthlyCap} ${access.monthlyCap === 1 ? 'cuenta' : 'cuentas'} este mes. Se reinicia el día 1.`);
      }
    }
  }

  // ------------------------------------------------------------------ lo que ve el admin

  async pendingCount(): Promise<number> {
    return this.prisma.wholesaleAccess.count({ where: { status: WholesaleAccessStatus.REQUESTED } });
  }

  async findAll(query: ListWholesaleAccessQueryDto) {
    // Con búsqueda se ve a cualquier vendedor (aunque nunca haya pedido acceso) para poder autorizarlo a mano.
    const where: Prisma.UserWhereInput = query.search
      ? {
          role: Role.USER,
          deletedAt: null,
          OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { email: { contains: query.search, mode: 'insensitive' } }],
        }
      : { deletedAt: null, wholesaleAccess: { is: { status: query.status ?? WholesaleAccessStatus.REQUESTED } } };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, createdAt: true, avatarUrl: true, wholesaleAccess: true },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: query.search ? { name: 'asc' } : { wholesaleAccess: { updatedAt: 'desc' } },
      }),
      this.prisma.user.count({ where }),
    ]);

    const data = await Promise.all(
      users.map(async (user) => {
        const [evaluation, used] = await Promise.all([this.evaluate(user.id), this.usedThisMonth(user.id)]);
        return {
          user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, memberSince: user.createdAt },
          status: user.wholesaleAccess?.status ?? null,
          monthlyCap: user.wholesaleAccess?.monthlyCap ?? null,
          usedThisMonth: used,
          note: user.wholesaleAccess?.note ?? null,
          requestedAt: user.wholesaleAccess?.requestedAt ?? null,
          reviewedAt: user.wholesaleAccess?.reviewedAt ?? null,
          requirements: evaluation.requirements,
          metCount: evaluation.metCount,
          total: evaluation.total,
        };
      }),
    );

    return { data, total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) || 1, suggestedCap: SUGGESTED_MONTHLY_CAP };
  }

  /** El admin autoriza, rechaza o retira el acceso de un vendedor. Puede autorizar aunque falte algún requisito. */
  async review(userId: string, dto: ReviewWholesaleAccessDto, admin: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }
    if (dto.status === WholesaleAccessStatus.REQUESTED) {
      throw new BadRequestException('Elige autorizar, rechazar o retirar el acceso.');
    }
    if (dto.status === WholesaleAccessStatus.REJECTED && !dto.note?.trim()) {
      throw new BadRequestException('Indica el motivo del rechazo para que el vendedor sepa qué mejorar.');
    }

    const authorizing = dto.status === WholesaleAccessStatus.AUTHORIZED;
    const monthlyCap = authorizing ? (dto.monthlyCap ?? null) : null;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.wholesaleAccess.upsert({
        where: { userId },
        create: { userId, status: dto.status, monthlyCap, reviewedAt: now, reviewedByUserId: admin.id, note: dto.note?.trim() || null },
        update: { status: dto.status, monthlyCap, reviewedAt: now, reviewedByUserId: admin.id, note: dto.note?.trim() || null },
      });
      await tx.adminActionLog.create({
        data: {
          adminUserId: admin.id,
          actionType: `WHOLESALE_ACCESS_${dto.status}`,
          targetEntity: 'WholesaleAccess',
          targetId: userId,
          reason: authorizing ? `Tope mensual: ${monthlyCap ?? 'sin tope'}` : (dto.note ?? null),
        },
      });
      if (authorizing) {
        await this.notificationsService.create(tx, {
          userId,
          type: NotificationType.WHOLESALE_ACCESS_APPROVED,
          payload: monthlyCap === null
            ? 'Ya puedes comprar cuentas al mayoreo. ¡Bienvenido!'
            : `Ya puedes comprar cuentas al mayoreo: hasta ${monthlyCap} ${monthlyCap === 1 ? 'cuenta' : 'cuentas'} por mes al principio. El tope sube conforme demuestras tu trayectoria.`,
        });
      } else {
        await this.notificationsService.create(tx, {
          userId,
          type: NotificationType.WHOLESALE_ACCESS_REJECTED,
          payload: dto.status === WholesaleAccessStatus.REVOKED
            ? `Tu acceso al mayoreo fue retirado${dto.note ? `: ${dto.note}` : '.'}`
            : `Tu solicitud de acceso al mayoreo no fue aprobada${dto.note ? `: ${dto.note}` : '.'} Puedes volver a pedirlo cuando mejores tu reputación.`,
        });
      }
    });

    return this.findOneForAdmin(userId);
  }

  private async findOneForAdmin(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, createdAt: true, avatarUrl: true, wholesaleAccess: true },
    });
    const [evaluation, used] = await Promise.all([this.evaluate(userId), this.usedThisMonth(userId)]);
    return {
      user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, memberSince: user.createdAt },
      status: user.wholesaleAccess?.status ?? null,
      monthlyCap: user.wholesaleAccess?.monthlyCap ?? null,
      usedThisMonth: used,
      note: user.wholesaleAccess?.note ?? null,
      requestedAt: user.wholesaleAccess?.requestedAt ?? null,
      reviewedAt: user.wholesaleAccess?.reviewedAt ?? null,
      requirements: evaluation.requirements,
      metCount: evaluation.metCount,
      total: evaluation.total,
    };
  }
}
