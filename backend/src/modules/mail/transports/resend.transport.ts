import { MailConfig, MailTransport, OutgoingMail } from '../mail.types';

/** Resend (https://resend.com): un POST con la API key. La URL se puede cambiar por variable de entorno para pruebas. */
export class ResendTransport implements MailTransport {
  readonly name = 'resend' as const;

  constructor(private readonly config: MailConfig) {}

  async send(mail: OutgoingMail): Promise<{ messageId?: string }> {
    const response = await fetch(this.config.resendApiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: mail.from,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string; error?: string };
    if (!response.ok) {
      throw new Error(`Resend respondió ${response.status}: ${body.message ?? body.error ?? 'error desconocido'}`);
    }
    return { messageId: body.id };
  }
}
