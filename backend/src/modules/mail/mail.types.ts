/** Lo que necesita cualquier proveedor para mandar un correo. */
export interface OutgoingMail {
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Un proveedor de correo intercambiable (log, Resend, Brevo, SMTP): la app solo conoce esta interfaz. */
export interface MailTransport {
  readonly name: MailProviderName;
  send(mail: OutgoingMail): Promise<{ messageId?: string }>;
}

export type MailProviderName = 'log' | 'resend' | 'brevo' | 'smtp';

export interface MailConfig {
  provider: MailProviderName;
  fromName: string;
  fromAddress?: string;
  replyTo?: string;
  resendApiKey?: string;
  resendApiUrl: string;
  brevoApiKey?: string;
  brevoApiUrl: string;
  smtpHost?: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPass?: string;
  /** URL pública de la app, para los enlaces de los correos. */
  appUrl: string;
}

/** Estado de la configuración de correo, para mostrárselo al admin. */
export interface MailConfigStatus {
  provider: MailProviderName;
  /** true = nada sale de verdad, solo se guarda en la bandeja de salida. */
  simulated: boolean;
  /** true = el proveedor elegido tiene todo lo necesario para enviar. */
  ready: boolean;
  /** Variables de entorno que faltan para poder enviar con el proveedor elegido. */
  missing: string[];
  from: string | null;
  replyTo: string | null;
}
