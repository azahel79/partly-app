import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailMessage, EmailStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { describeMailConfig, formatFrom, readMailConfig } from './mail.config';
import { emailLogoUrl } from './mail-logo';
import { EmailContent, renderEmail } from './mail-templates';
import { MailConfig, MailConfigStatus, MailTransport } from './mail.types';
import { BrevoTransport } from './transports/brevo.transport';
import { LogTransport } from './transports/log.transport';
import { ResendTransport } from './transports/resend.transport';
import { SmtpTransport } from './transports/smtp.transport';

type Db = PrismaService | Prisma.TransactionClient;

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 5 * 60 * 1000;
const STUCK_AFTER_MS = 10 * 60 * 1000;
const FLUSH_DEBOUNCE_MS = 1500;
const BATCH_SIZE = 25;
const RETENTION_DAYS = 90;

/** Correos que se mandan siempre, aunque la persona haya desactivado los avisos por correo. */
const MANDATORY_TEMPLATES = new Set(['password-reset', 'google-account', 'test']);

export interface EnqueueParams {
  to: string;
  toUserId?: string;
  /** Clave de la plantilla, para reconocer el tipo de correo en la bandeja de salida. */
  template: string;
  subject: string;
  content: EmailContent;
  /** false en correos que no se pueden desactivar (no lleva enlace a las preferencias). */
  includePrefsLink?: boolean;
  /** Si ya existe un correo con esta clave, este no se crea (evita duplicados). */
  dedupeKey?: string;
  /** No enviar antes de esta hora (ej. recordatorios de madrugada). */
  sendAfter?: Date | null;
  id?: string;
}

/**
 * Salida de correo de toda la app. Cada mensaje se guarda primero en la bandeja de salida
 * (EmailMessage) y un despachador lo envía con el proveedor configurado: así se puede reintentar,
 * evitar duplicados y auditar qué se mandó. Con MAIL_PROVIDER=log (por defecto) nada sale de
 * verdad y el admin lo ve en modo simulado; para activar el envío real solo se cambia el entorno.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly config: MailConfig;
  private transport: MailTransport | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private flushing = false;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.config = readMailConfig(configService);
  }

  // ------------------------------------------------------------------ configuración

  getStatus(): MailConfigStatus {
    return describeMailConfig(this.config);
  }

  get appUrl(): string {
    return this.config.appUrl;
  }

  /** Enlace a las preferencias de avisos del usuario. */
  get prefsUrl(): string {
    return `${this.config.appUrl}/panel/perfil?tab=notifications`;
  }

  private getTransport(): MailTransport {
    const status = this.getStatus();
    if (!status.ready) {
      throw new Error(`El correo no está configurado: falta ${status.missing.join(', ')}.`);
    }
    if (!this.transport) {
      switch (this.config.provider) {
        case 'resend':
          this.transport = new ResendTransport(this.config);
          break;
        case 'brevo':
          this.transport = new BrevoTransport(this.config);
          break;
        case 'smtp':
          this.transport = new SmtpTransport(this.config);
          break;
        default:
          this.transport = new LogTransport();
      }
    }
    return this.transport;
  }

  // ------------------------------------------------------------------ bandeja de salida

  /**
   * Guarda un correo en la bandeja de salida (puede ir dentro de la transacción de quien lo pide,
   * así el correo nace o no junto con el evento). Regresa created=false si ya existía uno con la
   * misma dedupeKey.
   */
  async enqueue(client: Db, params: EnqueueParams): Promise<{ created: boolean; id: string }> {
    const id = params.id ?? randomUUID();
    const rendered = renderEmail(params.content, {
      appUrl: this.config.appUrl,
      logoUrl: emailLogoUrl(this.config.appUrl),
      prefsUrl: params.includePrefsLink === false ? undefined : this.prefsUrl,
    });
    // createMany + skipDuplicates (ON CONFLICT DO NOTHING) no rompe la transacción cuando hay duplicado.
    const result = await client.emailMessage.createMany({
      data: [
        {
          id,
          toEmail: params.to,
          toUserId: params.toUserId,
          template: params.template,
          subject: params.subject,
          html: rendered.html,
          text: rendered.text,
          dedupeKey: params.dedupeKey,
          sendAfter: params.sendAfter ?? null,
        },
      ],
      skipDuplicates: true,
    });
    if (result.count > 0) {
      this.scheduleFlush();
    }
    return { created: result.count > 0, id };
  }

  async hasDedupeKey(dedupeKey: string): Promise<boolean> {
    return (await this.prisma.emailMessage.count({ where: { dedupeKey } })) > 0;
  }

  /** Pide un envío pronto sin bloquear a quien lo pidió (por si el correo nació dentro de una transacción que aún no confirma). */
  scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flushQueue();
    }, FLUSH_DEBOUNCE_MS);
    this.flushTimer.unref?.();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async flushQueue(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      await this.recoverStuck();
      const now = new Date();
      const due = await this.prisma.emailMessage.findMany({
        where: { status: EmailStatus.QUEUED, OR: [{ sendAfter: null }, { sendAfter: { lte: now } }] },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
        select: { id: true },
      });
      for (const { id } of due) {
        await this.dispatch(id);
      }
    } catch (error) {
      this.logger.error(`No se pudo vaciar la bandeja de salida: ${(error as Error).message}`);
    } finally {
      this.flushing = false;
    }
  }

  /** Un envío que se quedó "enviándose" (el servidor se reinició a media tarea) vuelve a la cola. */
  private async recoverStuck(): Promise<void> {
    await this.prisma.emailMessage.updateMany({
      where: { status: EmailStatus.SENDING, updatedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
      data: { status: EmailStatus.QUEUED },
    });
  }

  /** Envía un correo de la cola con el proveedor configurado; si falla, lo reintenta con espera creciente. */
  async dispatch(id: string): Promise<EmailMessage | null> {
    const now = new Date();
    // Reclamo atómico: dos despachadores a la vez no mandan el mismo correo dos veces.
    const claim = await this.prisma.emailMessage.updateMany({
      where: { id, status: EmailStatus.QUEUED, OR: [{ sendAfter: null }, { sendAfter: { lte: now } }] },
      data: { status: EmailStatus.SENDING, attempts: { increment: 1 } },
    });
    if (claim.count === 0) {
      return this.prisma.emailMessage.findUnique({ where: { id } });
    }
    const message = await this.prisma.emailMessage.findUniqueOrThrow({ where: { id } });

    // Si la persona desactivó los correos entre que se creó y ahora, no se manda (salvo los obligatorios).
    if (message.toUserId && !MANDATORY_TEMPLATES.has(message.template)) {
      const user = await this.prisma.user.findUnique({ where: { id: message.toUserId }, select: { emailNotifications: true, deletedAt: true } });
      if (!user || user.deletedAt || !user.emailNotifications) {
        return this.prisma.emailMessage.update({
          where: { id },
          data: { status: EmailStatus.SKIPPED, error: 'La persona desactivó los correos o ya no tiene cuenta.' },
        });
      }
    }

    try {
      const transport = this.getTransport();
      const result = await transport.send({
        from: formatFrom(this.config),
        replyTo: this.config.replyTo,
        to: message.toEmail,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      return await this.prisma.emailMessage.update({
        where: { id },
        data: { status: EmailStatus.SENT, provider: transport.name, providerMessageId: result.messageId ?? null, sentAt: new Date(), error: null },
      });
    } catch (error) {
      const exhausted = message.attempts >= MAX_ATTEMPTS;
      const reason = (error as Error).message.slice(0, 500);
      this.logger.warn(`Correo ${id} a ${message.toEmail} falló (intento ${message.attempts}/${MAX_ATTEMPTS}): ${reason}`);
      return this.prisma.emailMessage.update({
        where: { id },
        data: {
          status: exhausted ? EmailStatus.FAILED : EmailStatus.QUEUED,
          provider: this.config.provider,
          error: reason,
          sendAfter: exhausted ? null : new Date(Date.now() + message.attempts * RETRY_BACKOFF_MS),
        },
      });
    }
  }

  /** Vuelve a intentar un correo fallido (o que se saltó) desde cero. */
  async retry(id: string): Promise<EmailMessage | null> {
    const reset = await this.prisma.emailMessage.updateMany({
      where: { id, status: { in: [EmailStatus.FAILED, EmailStatus.SKIPPED] } },
      data: { status: EmailStatus.QUEUED, attempts: 0, sendAfter: null, error: null },
    });
    if (reset.count === 0) return null;
    return this.dispatch(id);
  }

  /** Limpieza diaria: no se guarda el historial de correos para siempre. */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOld(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await this.prisma.emailMessage.deleteMany({ where: { createdAt: { lt: cutoff }, status: { in: [EmailStatus.SENT, EmailStatus.SKIPPED, EmailStatus.FAILED] } } });
    if (result.count > 0) {
      this.logger.log(`Bandeja de salida: ${result.count} correo(s) con más de ${RETENTION_DAYS} días eliminados.`);
    }
  }

  // ------------------------------------------------------------------ envíos inmediatos

  /** Guarda el correo y lo manda ya (contraseña olvidada, prueba del admin): no espera a la cola. */
  private async sendImmediate(params: EnqueueParams): Promise<EmailMessage | null> {
    const { id } = await this.enqueue(this.prisma, params);
    return this.dispatch(id);
  }

  /** Correo de prueba del admin para comprobar que el proveedor configurado de verdad entrega. */
  async sendTest(to: string): Promise<EmailMessage | null> {
    const status = this.getStatus();
    return this.sendImmediate({
      to,
      template: 'test',
      subject: 'Prueba de correo de Tequio',
      includePrefsLink: false,
      content: {
        title: 'Tu correo está funcionando',
        greeting: 'Hola,',
        paragraphs: [
          status.simulated
            ? 'Este es un correo de prueba en modo simulado: no salió de la app, pero así se ve lo que enviaremos a tus usuarios.'
            : `Este correo salió de verdad por ${status.provider}. Si lo estás leyendo, el envío quedó bien configurado.`,
        ],
        cta: { label: 'Abrir Tequio', url: this.config.appUrl },
      },
    });
  }

  // ------------------------------------------------------------------ API que ya usaban otros módulos

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.sendImmediate({
      to,
      template: 'password-reset',
      subject: 'Restablece tu contraseña de Tequio',
      includePrefsLink: false,
      content: {
        title: 'Restablece tu contraseña',
        greeting: 'Hola,',
        paragraphs: [
          'Recibimos una solicitud para cambiar la contraseña de tu cuenta de Tequio. Usa el botón para elegir una nueva.',
          'El enlace vence pronto. Si tú no lo pediste, ignora este correo: tu contraseña no cambia.',
        ],
        cta: { label: 'Elegir nueva contraseña', url: resetUrl },
        note: `Si el botón no funciona, copia este enlace en tu navegador: ${resetUrl}`,
      },
    });
  }

  async sendGoogleAccountNotice(to: string): Promise<void> {
    await this.sendImmediate({
      to,
      template: 'google-account',
      subject: 'Tu cuenta de Tequio inicia sesión con Google',
      includePrefsLink: false,
      content: {
        title: 'Tu cuenta usa Google para entrar',
        greeting: 'Hola,',
        paragraphs: ['Pediste restablecer una contraseña, pero esta cuenta inicia sesión con Google y no tiene contraseña que cambiar.', 'Entra con el botón "Continuar con Google" en la pantalla de inicio de sesión.'],
        cta: { label: 'Ir a iniciar sesión', url: `${this.config.appUrl}/iniciar-sesion` },
      },
    });
  }

  /** Aviso genérico de respaldo a una notificación en la app (incidencias, estado del perfil de proveedor). */
  /** Aviso suelto por correo. `cta` lleva a una pantalla de la app (ruta interna); sin ella, a la página principal. */
  async sendNotice(to: string, subject: string, body: string, cta?: { label: string; path: string }): Promise<void> {
    await this.sendImmediate({
      to,
      template: 'notice',
      subject,
      content: {
        title: subject,
        greeting: 'Hola,',
        paragraphs: [body],
        cta: cta ? { label: cta.label, url: `${this.config.appUrl}${cta.path}` } : { label: 'Abrir Tequio', url: this.config.appUrl },
      },
    });
  }
}
