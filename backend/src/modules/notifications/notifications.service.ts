import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { firstName } from '../mail/mail-templates';
import { deferToDaytime } from '../mail/quiet-hours';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { EMAIL_RULES } from './email-rules';

type PrismaOrTx = PrismaService | Prisma.TransactionClient;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  /**
   * La usan otros módulos (ej. Payments) para dejar un aviso, opcionalmente dentro de una
   * transacción. Además del aviso en la app, si el tipo lo amerita (ver EMAIL_RULES) y la persona
   * no desactivó los correos, deja el mismo mensaje en la bandeja de salida. Cada canal respeta su
   * propio interruptor: apagar los avisos en la app no apaga los correos, ni al revés.
   */
  async create(
    client: PrismaOrTx,
    params: { userId: string; type: NotificationType; payload: string; groupId?: string; emailDedupeKey?: string; emailImmediate?: boolean },
  ) {
    const preferences = await client.user.findUnique({
      where: { id: params.userId },
      select: {
        email: true,
        name: true,
        role: true,
        deletedAt: true,
        emailNotifications: true,
        inAppNotifications: true,
        notifyPayments: true,
        notifyGroups: true,
        notifyCredentials: true,
        notifyPayouts: true,
      },
    });
    if (!preferences) return null;

    const paymentTypes: NotificationType[] = [
      NotificationType.PAYMENT_DUE_SOON, NotificationType.PAYMENT_FAILED,
      NotificationType.PAYMENT_RECEIPT_UPLOADED, NotificationType.PAYMENT_RECEIPT_REJECTED,
      NotificationType.PAYMENT_CONFIRMED,
      NotificationType.COMMISSION_DUE, NotificationType.COMMISSION_REMINDER, NotificationType.COMMISSION_OVERDUE,
      NotificationType.COMMISSION_RECEIPT_UPLOADED, NotificationType.COMMISSION_PAID, NotificationType.COMMISSION_REJECTED,
    ];
    const groupTypes: NotificationType[] = [
      NotificationType.MEMBERSHIP_CANCELLED, NotificationType.PROVIDER_STATUS_CHANGED,
      NotificationType.PROVIDER_ORDER_PLACED, NotificationType.PROVIDER_ORDER_DELIVERED,
      NotificationType.INCIDENT_OPENED, NotificationType.INCIDENT_MESSAGE,
      NotificationType.INCIDENT_STATUS_CHANGED,
      NotificationType.PROVIDER_ORDER_RECEIPT_UPLOADED, NotificationType.PROVIDER_ORDER_RECEIPT_REJECTED,
      NotificationType.PROVIDER_ORDER_EXPIRING, NotificationType.PROVIDER_ORDER_EXPIRED, NotificationType.PROVIDER_ORDER_CANCELLED,
      NotificationType.WHOLESALE_ACCESS_REQUESTED, NotificationType.WHOLESALE_ACCESS_APPROVED, NotificationType.WHOLESALE_ACCESS_REJECTED,
      NotificationType.GROUP_READY_TO_START, NotificationType.GROUP_FULL, NotificationType.GROUP_START_REMINDER,
    ];
    if (paymentTypes.includes(params.type) && !preferences.notifyPayments) return null;
    if (groupTypes.includes(params.type) && !preferences.notifyGroups) return null;
    if (params.type === NotificationType.CREDENTIAL_UPDATED && !preferences.notifyCredentials) return null;
    if (params.type === NotificationType.PAYOUT_PAID && !preferences.notifyPayouts) return null;

    const { emailDedupeKey, emailImmediate, ...data } = params;
    const notification = preferences.inAppNotifications ? await client.notification.create({ data }) : null;
    await this.mirrorToEmail(client, preferences, params, { dedupeKey: emailDedupeKey, immediate: emailImmediate });
    return notification;
  }

  /** Copia el aviso a la bandeja de salida de correo, si corresponde. */
  private async mirrorToEmail(
    client: PrismaOrTx,
    user: { email: string; name: string; role: Role; deletedAt: Date | null; emailNotifications: boolean },
    params: { userId: string; type: NotificationType; payload: string; groupId?: string },
    options: { dedupeKey?: string; immediate?: boolean } = {},
  ): Promise<void> {
    const rule = EMAIL_RULES[params.type];
    if (!rule || !user.emailNotifications || user.deletedAt) return;
    const isAdmin = user.role === Role.ADMIN;
    if ((rule.audience === 'user' && isAdmin) || (rule.audience === 'admin' && !isAdmin)) return;

    const cta = rule.cta?.(params, user.role) ?? null;
    const name = firstName(user.name);
    await this.mailService.enqueue(client, {
      to: user.email,
      toUserId: params.userId,
      template: `notification-${params.type.toLowerCase()}`,
      subject: rule.title,
      dedupeKey: options.dedupeKey,
      // Un aviso que un admin manda a propósito sale ya; los automáticos esperan a la mañana.
      sendAfter: rule.defer && !options.immediate ? deferToDaytime(new Date()) : null,
      content: {
        title: rule.title,
        preheader: params.payload.length > 110 ? `${params.payload.slice(0, 107).trimEnd()}…` : params.payload,
        greeting: name ? `Hola ${name},` : 'Hola,',
        paragraphs: [params.payload],
        cta: cta ? { label: cta.label, url: `${this.mailService.appUrl}${cta.path}` } : undefined,
      },
    });
  }

  async findMine(userId: string, query: ListNotificationsQueryDto) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { group: { select: { plan: { select: { tierName: true, platform: { select: { name: true } } } } } } },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return { data, total, unreadCount };
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notificación no encontrada.');
    }
    if (notification.readAt) {
      return notification;
    }
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
