export type EmailStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
export type MailProviderName = 'log' | 'resend' | 'brevo' | 'smtp';

export interface MailStatus {
  provider: MailProviderName;
  /** true = nada sale de verdad: los correos solo se guardan en la bandeja de salida. */
  simulated: boolean;
  /** true = el proveedor elegido tiene todo lo necesario para enviar. */
  ready: boolean;
  /** Variables de entorno que faltan para enviar con el proveedor elegido. */
  missing: string[];
  from: string | null;
  replyTo: string | null;
  counts: { queued: number; sent: number; failed: number; skipped: number; sentLast24h: number };
}

export interface MailMessageSummary {
  id: string;
  toEmail: string;
  toUserId: string | null;
  template: string;
  subject: string;
  status: EmailStatus;
  provider: string | null;
  error: string | null;
  attempts: number;
  sendAfter: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface MailMessageDetail extends MailMessageSummary {
  html: string;
  text: string;
  providerMessageId: string | null;
}

export interface MailMessagesPage {
  data: MailMessageSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Resultado del botón "Enviar recordatorio": a quién le llegó y por qué canales. */
export interface ReminderResult {
  sentTo: 'BUYER' | 'SELLER';
  name: string;
  inApp: boolean;
  email: boolean;
}
