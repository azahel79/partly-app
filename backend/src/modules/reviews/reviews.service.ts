import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MembershipStatus, NotificationType, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { UpsertReviewDto } from './dto/upsert-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';

const WITH_AUTHOR = { author: { select: { id: true, name: true, avatarUrl: true, profileNameVisible: true, profileAvatarVisible: true } } } satisfies Prisma.ReviewInclude;

/** Días que debe llevar el comprador con el servicio (desde su primer pago validado) para poder reseñar. */
export const MIN_REVIEW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Reseñar es para quien ya usó el servicio: hace falta un pago validado por el vendedor y al menos
   * MIN_REVIEW_DAYS días desde ese primer pago. Así nadie aparta un cupo sin pagar para dejar cinco estrellas.
   */
  async eligibility(groupId: string, userId: string): Promise<{ canReview: boolean; reason: string | null; eligibleAt: Date | null; hasReview: boolean }> {
    const group = await this.prisma.group.findUnique({ where: { id: groupId }, select: { ownerId: true } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    if (group.ownerId === userId) {
      return { canReview: false, reason: 'No puedes reseñar tu propio grupo.', eligibleAt: null, hasReview: false };
    }
    const membership = await this.prisma.groupMembership.findFirst({
      where: { groupId, userId },
      orderBy: { joinedAt: 'desc' },
      include: { review: { select: { id: true } } },
    });
    if (!membership) {
      return { canReview: false, reason: 'Solo quienes usaron este grupo pueden reseñarlo.', eligibleAt: null, hasReview: false };
    }
    const hasReview = membership.review !== null;
    const firstPaid = await this.prisma.payment.findFirst({
      where: { membershipId: membership.id, status: PaymentStatus.PAID, paidAt: { not: null } },
      orderBy: { paidAt: 'asc' },
      select: { paidAt: true },
    });
    if (!firstPaid) {
      return { canReview: hasReview, reason: 'Podrás reseñar cuando tu primer pago sea validado por el vendedor.', eligibleAt: null, hasReview };
    }
    const eligibleAt = new Date(firstPaid.paidAt!.getTime() + MIN_REVIEW_DAYS * DAY_MS);
    if (eligibleAt.getTime() > Date.now()) {
      return { canReview: hasReview, reason: `Podrás reseñar a partir del ${eligibleAt.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' })}, cuando lleves ${MIN_REVIEW_DAYS} días con el servicio.`, eligibleAt, hasReview };
    }
    return { canReview: true, reason: null, eligibleAt, hasReview };
  }

  /** El vendedor responde públicamente a una reseña de su grupo (no puede borrarla). */
  async reply(groupId: string, reviewId: string, requesterId: string, dto: ReplyReviewDto) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, groupId },
      include: { group: { include: { plan: { include: { platform: { select: { name: true } } } } } }, ...WITH_AUTHOR },
    });
    if (!review) {
      throw new NotFoundException('Reseña no encontrada.');
    }
    if (review.group.ownerId !== requesterId) {
      throw new ForbiddenException('Solo el vendedor del grupo puede responder a sus reseñas.');
    }
    const isNew = review.sellerReply === null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.review.update({
        where: { id: reviewId },
        data: { sellerReply: dto.reply.trim(), sellerReplyAt: new Date() },
        include: WITH_AUTHOR,
      });
      if (isNew) {
        await this.notificationsService.create(tx, {
          userId: review.authorUserId,
          type: NotificationType.SYSTEM,
          email: false,
          groupId,
          payload: `El vendedor respondió a tu reseña del grupo de ${review.group.plan.platform.name}.`,
        });
      }
      return saved;
    });
    return updated;
  }

  /**
   * Una vez al día, a quien lleva 7 días con el servicio y todavía no reseña se le pide que lo haga (una sola vez).
   * `now` existe para poder probarlo.
   */
  @Cron(CronExpression.EVERY_DAY_AT_11AM)
  async sendReviewReminders(now: Date = new Date()): Promise<number> {
    const limit = new Date(now.getTime() - MIN_REVIEW_DAYS * DAY_MS);
    const candidates = await this.prisma.groupMembership.findMany({
      where: {
        status: MembershipStatus.ACTIVE,
        reviewReminderSentAt: null,
        review: { is: null },
        payments: { some: { status: PaymentStatus.PAID, paidAt: { lte: limit } } },
        group: { startedAt: { not: null } },
      },
      include: { group: { include: { plan: { include: { platform: { select: { name: true } } } } } } },
    });
    let sent = 0;
    for (const membership of candidates) {
      if (membership.group.ownerId === membership.userId) continue;
      await this.prisma.$transaction(async (tx) => {
        await this.notificationsService.create(tx, {
          userId: membership.userId,
          type: NotificationType.SYSTEM,
          email: false,
          groupId: membership.groupId,
          payload: `¿Cómo te va con tu cuenta de ${membership.group.plan.platform.name}? Deja tu reseña: le sirve a otros compradores y al vendedor.`,
        });
        await tx.groupMembership.update({ where: { id: membership.id }, data: { reviewReminderSentAt: now } });
      });
      sent += 1;
    }
    if (sent > 0) this.logger.log(`Recordatorios de reseña enviados: ${sent}.`);
    return sent;
  }

  async findMany(groupId: string, query: ListReviewsQueryDto) {
    const where: Prisma.ReviewWhereInput = { groupId };

    const [data, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: WITH_AUTHOR,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.review.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Crea o actualiza (upsert) la reseña del que llama para SU membresía más reciente en
   * este grupo. Un usuario que se unió y salió varias veces reseña su última estadía.
   */
  async upsert(groupId: string, requesterId: string, dto: UpsertReviewDto) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    if (group.ownerId === requesterId) {
      throw new BadRequestException('No puedes reseñar tu propio grupo.');
    }

    const membership = await this.prisma.groupMembership.findFirst({
      where: { groupId, userId: requesterId },
      orderBy: { joinedAt: 'desc' },
    });
    if (!membership) {
      throw new BadRequestException('Debes haber sido miembro de este grupo para poder reseñarlo.');
    }
    const eligibility = await this.eligibility(groupId, requesterId);
    if (!eligibility.canReview) {
      throw new BadRequestException(eligibility.reason ?? 'Todavía no puedes reseñar este grupo.');
    }

    const review = await this.prisma.review.upsert({
      where: { membershipId: membership.id },
      create: {
        groupId,
        membershipId: membership.id,
        authorUserId: requesterId,
        rating: dto.rating,
        comment: dto.comment,
      },
      update: { rating: dto.rating, comment: dto.comment },
      include: WITH_AUTHOR,
    });

    await this.recalculateOwnerRating(group.ownerId);
    return review;
  }

  async remove(groupId: string, requesterId: string): Promise<void> {
    const membership = await this.prisma.groupMembership.findFirst({
      where: { groupId, userId: requesterId },
      orderBy: { joinedAt: 'desc' },
    });
    const review = membership
      ? await this.prisma.review.findUnique({ where: { membershipId: membership.id } })
      : null;
    if (!review) {
      throw new NotFoundException('No tienes una reseña en este grupo.');
    }

    const group = await this.prisma.group.findUniqueOrThrow({ where: { id: groupId } });
    await this.prisma.review.delete({ where: { id: review.id } });
    await this.recalculateOwnerRating(group.ownerId);
  }

  private async recalculateOwnerRating(ownerId: string): Promise<void> {
    const result = await this.prisma.review.aggregate({
      where: { group: { ownerId } },
      _avg: { rating: true },
    });
    const ratingAvg = Math.round((result._avg.rating ?? 0) * 100) / 100;
    await this.prisma.user.update({ where: { id: ownerId }, data: { ratingAvg } });
  }
}
