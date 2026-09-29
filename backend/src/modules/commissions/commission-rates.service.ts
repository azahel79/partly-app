import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CommissionChargeStatus, CommissionRateRequestStatus, NotificationType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { NotificationsService } from '../notifications/notifications.service';
import {
  DAY_MS,
  DEFAULT_COMMISSION_PCT,
  MIN_COMMISSION_PCT,
  RATE_CLEAN_DAYS,
  RATE_MIN_RATING,
  RATE_MIN_REVIEWS,
  RATE_MIN_VALIDATED_PAYMENTS,
  RATE_RETRY_DAYS,
  round2,
} from './commissions.constants';
import { CommissionsService } from './commissions.service';
import { ListRateRequestsQueryDto } from './dto/list-rate-requests-query.dto';
import { RequestRateDto } from './dto/request-rate.dto';
import { ReviewRateRequestDto } from './dto/review-rate-request.dto';

export interface RateRequirement {
  key: 'payments' | 'rating' | 'commission';
  label: string;
  hint: string;
  met: boolean;
  /** Avance hacia la meta, para pintar la barra. */
  current: number;
  target: number;
}

/**
 * Comisión reducida por reputación. Todos los grupos pagan la comisión general (9%); un vendedor con
 * buena trayectoria la puede pedir más baja, y si el admin la autoriza aplica a todos sus grupos para
 * los pagos que se validen desde ese momento (lo ya registrado no cambia).
 */
@Injectable()
export class CommissionRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commissionsService: CommissionsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ------------------------------------------------------------------ requisitos

  async evaluate(sellerId: string): Promise<{ requirements: RateRequirement[]; allMet: boolean }> {
    const cleanSince = new Date(Date.now() - RATE_CLEAN_DAYS * DAY_MS);
    const [payments, reviews, lateCharges] = await Promise.all([
      this.prisma.earningEntry.count({ where: { sellerId } }),
      this.prisma.review.aggregate({ where: { group: { ownerId: sellerId } }, _avg: { rating: true }, _count: true }),
      // Vencida = se le avisó que venció en los últimos 90 días, o tiene una sin pagar pasada su fecha límite.
      this.prisma.commissionCharge.count({
        where: {
          sellerId,
          OR: [
            { overdueNotifiedAt: { gte: cleanSince } },
            { status: { not: CommissionChargeStatus.PAID }, payBy: { lt: new Date() } },
          ],
        },
      }),
    ]);
    const reviewCount = reviews._count;
    const rating = round2(reviews._avg.rating ?? 0);

    const requirements: RateRequirement[] = [
      {
        key: 'payments',
        label: `${RATE_MIN_VALIDATED_PAYMENTS} pagos validados`,
        hint: 'Cuenta cada pago de tus compradores que aprobaste.',
        met: payments >= RATE_MIN_VALIDATED_PAYMENTS,
        current: Math.min(payments, RATE_MIN_VALIDATED_PAYMENTS),
        target: RATE_MIN_VALIDATED_PAYMENTS,
      },
      {
        key: 'rating',
        label: `Calificación de ${RATE_MIN_RATING} o más (con ${RATE_MIN_REVIEWS} reseñas mínimo)`,
        hint: 'Se calcula con las reseñas de todos tus grupos.',
        met: reviewCount >= RATE_MIN_REVIEWS && rating >= RATE_MIN_RATING,
        current: reviewCount >= RATE_MIN_REVIEWS ? rating : 0,
        target: RATE_MIN_RATING,
      },
      {
        key: 'commission',
        label: `Sin comisiones vencidas en los últimos ${RATE_CLEAN_DAYS} días`,
        hint: 'Paga tu comisión antes de su fecha límite.',
        met: lateCharges === 0,
        current: lateCharges === 0 ? 1 : 0,
        target: 1,
      },
    ];
    return { requirements, allMet: requirements.every((r) => r.met) };
  }

  // ------------------------------------------------------------------ lo que ve el vendedor

  async getMine(sellerId: string) {
    const [rate, evaluation, last] = await Promise.all([
      this.commissionsService.rateFor(sellerId),
      this.evaluate(sellerId),
      this.prisma.commissionRateRequest.findFirst({ where: { sellerId }, orderBy: { createdAt: 'desc' } }),
    ]);
    const pending = last?.status === CommissionRateRequestStatus.PENDING;
    const retryAt =
      last?.status === CommissionRateRequestStatus.REJECTED && last.reviewedAt
        ? new Date(last.reviewedAt.getTime() + RATE_RETRY_DAYS * DAY_MS)
        : null;
    const waiting = retryAt !== null && retryAt.getTime() > Date.now();
    return {
      rate,
      defaultRate: DEFAULT_COMMISSION_PCT,
      minRate: MIN_COMMISSION_PCT,
      reduced: rate < DEFAULT_COMMISSION_PCT,
      requirements: evaluation.requirements,
      allMet: evaluation.allMet,
      lastRequest: last
        ? {
            id: last.id,
            status: last.status,
            createdAt: last.createdAt,
            reviewedAt: last.reviewedAt,
            approvedRate: last.approvedRate !== null ? Number(last.approvedRate) : null,
            reviewNote: last.reviewNote,
          }
        : null,
      retryAt: waiting ? retryAt : null,
      canRequest: evaluation.allMet && !pending && !waiting && rate > MIN_COMMISSION_PCT,
    };
  }

  async request(sellerId: string, dto: RequestRateDto) {
    const mine = await this.getMine(sellerId);
    if (mine.lastRequest?.status === CommissionRateRequestStatus.PENDING) {
      throw new ConflictException('Ya tienes una solicitud en revisión.');
    }
    if (mine.rate <= MIN_COMMISSION_PCT) {
      throw new BadRequestException(`Ya tienes la comisión más baja posible (${MIN_COMMISSION_PCT}%).`);
    }
    if (mine.retryAt) {
      throw new BadRequestException(`Podrás volver a pedirla a partir del ${mine.retryAt.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}.`);
    }
    if (!mine.allMet) {
      throw new BadRequestException('Todavía no cumples los requisitos para pedir una comisión reducida.');
    }

    const seller = await this.prisma.user.findUniqueOrThrow({ where: { id: sellerId }, select: { name: true } });
    const admins = await this.prisma.user.findMany({ where: { role: Role.ADMIN, deletedAt: null }, select: { id: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.commissionRateRequest.create({
        data: { sellerId, currentRate: mine.rate, message: dto.message?.trim() || null },
      });
      for (const admin of admins) {
        await this.notificationsService.create(tx, {
          userId: admin.id,
          type: NotificationType.COMMISSION_RATE_REQUESTED,
          payload: `${seller.name} cumple los requisitos y pidió bajar su comisión (hoy paga ${mine.rate}%). Revisa su reputación en Comisiones.`,
        });
      }
    });
    return this.getMine(sellerId);
  }

  // ------------------------------------------------------------------ lo que ve el admin

  async pendingCount(): Promise<number> {
    return this.prisma.commissionRateRequest.count({ where: { status: CommissionRateRequestStatus.PENDING } });
  }

  async findAll(query: ListRateRequestsQueryDto) {
    const where: Prisma.CommissionRateRequestWhereInput = { status: query.status ?? CommissionRateRequestStatus.PENDING };
    const [rows, total] = await Promise.all([
      this.prisma.commissionRateRequest.findMany({
        where,
        include: { seller: { select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true } } },
        orderBy: { createdAt: query.status && query.status !== CommissionRateRequestStatus.PENDING ? 'desc' : 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.commissionRateRequest.count({ where }),
    ]);
    const data = await Promise.all(
      rows.map(async (row) => {
        const [evaluation, activeGroups] = await Promise.all([
          this.evaluate(row.sellerId),
          this.prisma.group.count({ where: { ownerId: row.sellerId, approvalStatus: 'APPROVED', status: { not: 'CANCELLED' } } }),
        ]);
        return {
          id: row.id,
          status: row.status,
          createdAt: row.createdAt,
          reviewedAt: row.reviewedAt,
          currentRate: Number(row.currentRate),
          approvedRate: row.approvedRate !== null ? Number(row.approvedRate) : null,
          message: row.message,
          reviewNote: row.reviewNote,
          seller: { id: row.seller.id, name: row.seller.name, email: row.seller.email, avatarUrl: row.seller.avatarUrl, memberSince: row.seller.createdAt },
          activeGroups,
          requirements: evaluation.requirements,
        };
      }),
    );
    return { data, total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) || 1, minRate: MIN_COMMISSION_PCT, defaultRate: DEFAULT_COMMISSION_PCT };
  }

  /** Aprobar fija la comisión nueva del vendedor y la aplica a todos sus grupos; rechazar requiere motivo. */
  async review(id: string, dto: ReviewRateRequestDto, admin: AuthenticatedUser) {
    const request = await this.prisma.commissionRateRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Solicitud no encontrada.');
    }
    if (request.status !== CommissionRateRequestStatus.PENDING) {
      throw new BadRequestException('Esta solicitud ya fue revisada.');
    }
    const currentRate = Number(request.currentRate);
    if (dto.approve) {
      if (dto.rate === undefined) {
        throw new BadRequestException('Indica el porcentaje nuevo.');
      }
      if (dto.rate < MIN_COMMISSION_PCT || dto.rate >= currentRate) {
        throw new BadRequestException(`El porcentaje nuevo debe ser menor a ${currentRate}% y de al menos ${MIN_COMMISSION_PCT}%.`);
      }
    } else if (!dto.note?.trim()) {
      throw new BadRequestException('Indica el motivo para que el vendedor sepa qué mejorar.');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Solo pasa de PENDING a revisada una vez, aunque dos admins den clic al mismo tiempo.
      const updated = await tx.commissionRateRequest.updateMany({
        where: { id, status: CommissionRateRequestStatus.PENDING },
        data: {
          status: dto.approve ? CommissionRateRequestStatus.APPROVED : CommissionRateRequestStatus.REJECTED,
          approvedRate: dto.approve ? dto.rate : null,
          reviewNote: dto.note?.trim() || null,
          reviewedByUserId: admin.id,
          reviewedAt: now,
        },
      });
      if (updated.count === 0) {
        throw new ConflictException('Otro administrador ya revisó esta solicitud.');
      }
      await tx.adminActionLog.create({
        data: {
          adminUserId: admin.id,
          actionType: dto.approve ? 'COMMISSION_RATE_APPROVED' : 'COMMISSION_RATE_REJECTED',
          targetEntity: 'User',
          targetId: request.sellerId,
          reason: dto.approve ? `De ${currentRate}% a ${dto.rate}%` : dto.note!.trim(),
        },
      });
      if (dto.approve) {
        await tx.user.update({ where: { id: request.sellerId }, data: { commissionRate: dto.rate } });
        // Todos sus grupos (también los que están en revisión) cobran el porcentaje nuevo desde ahora.
        await tx.group.updateMany({ where: { ownerId: request.sellerId }, data: { commissionPercentage: dto.rate } });
        await this.notificationsService.create(tx, {
          userId: request.sellerId,
          type: NotificationType.COMMISSION_RATE_APPROVED,
          payload: `¡Tu comisión bajó a ${dto.rate}%! Aplica en todos tus grupos para los pagos que valides desde hoy.${dto.note?.trim() ? ` ${dto.note.trim()}` : ''}`,
        });
      } else {
        await this.notificationsService.create(tx, {
          userId: request.sellerId,
          type: NotificationType.COMMISSION_RATE_REJECTED,
          payload: `Tu solicitud de comisión reducida no fue aprobada: ${dto.note!.trim()} Podrás volver a pedirla en ${RATE_RETRY_DAYS} días.`,
        });
      }
    });
    return { id, status: dto.approve ? CommissionRateRequestStatus.APPROVED : CommissionRateRequestStatus.REJECTED };
  }
}
