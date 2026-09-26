import { ConfigService } from '@nestjs/config';
import { MailConfig, MailConfigStatus, MailProviderName } from './mail.types';

const PROVIDERS: MailProviderName[] = ['log', 'resend', 'brevo', 'smtp'];

/** Lee la configuración de correo del entorno; un proveedor desconocido se trata como "log" (simulado). */
export function readMailConfig(config: ConfigService): MailConfig {
  const raw = String(config.get<string>('mail.provider') ?? 'log').toLowerCase() as MailProviderName;
  return {
    provider: PROVIDERS.includes(raw) ? raw : 'log',
    fromName: config.get<string>('mail.fromName') ?? 'Partly',
    fromAddress: config.get<string>('mail.fromAddress'),
    replyTo: config.get<string>('mail.replyTo'),
    resendApiKey: config.get<string>('mail.resendApiKey'),
    resendApiUrl: config.get<string>('mail.resendApiUrl') ?? 'https://api.resend.com/emails',
    brevoApiKey: config.get<string>('mail.brevoApiKey'),
    brevoApiUrl: config.get<string>('mail.brevoApiUrl') ?? 'https://api.brevo.com/v3/smtp/email',
    smtpHost: config.get<string>('mail.smtpHost'),
    smtpPort: config.get<number>('mail.smtpPort') ?? 587,
    smtpSecure: config.get<boolean>('mail.smtpSecure') ?? false,
    smtpUser: config.get<string>('mail.smtpUser'),
    smtpPass: config.get<string>('mail.smtpPass'),
    appUrl: (config.get<string>('frontendUrl') ?? 'http://localhost:4200').replace(/\/$/, ''),
  };
}

/** Dirección que aparece como remitente: "Partly <no-reply@dominio>". */
export function formatFrom(config: MailConfig): string {
  const address = config.fromAddress ?? 'no-reply@partly.local';
  return `${config.fromName} <${address}>`;
}

/** Qué le falta a la configuración para poder enviar de verdad con el proveedor elegido. */
export function describeMailConfig(config: MailConfig): MailConfigStatus {
  const missing: string[] = [];
  if (config.provider !== 'log') {
    if (!config.fromAddress) missing.push('MAIL_FROM_ADDRESS');
    if (config.provider === 'resend' && !config.resendApiKey) missing.push('RESEND_API_KEY');
    if (config.provider === 'brevo' && !config.brevoApiKey) missing.push('BREVO_API_KEY');
    if (config.provider === 'smtp') {
      if (!config.smtpHost) missing.push('SMTP_HOST');
      if (!config.smtpUser) missing.push('SMTP_USER');
      if (!config.smtpPass) missing.push('SMTP_PASS');
    }
  }
  return {
    provider: config.provider,
    simulated: config.provider === 'log',
    ready: missing.length === 0,
    missing,
    from: config.provider === 'log' ? null : formatFrom(config),
    replyTo: config.replyTo ?? null,
  };
}
