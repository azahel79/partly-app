import { MailConfig, MailTransport, OutgoingMail } from '../mail.types';

/** Brevo (https://www.brevo.com): API transaccional v3 con la clave en el encabezado api-key. */
export class BrevoTransport implements MailTransport {
  readonly name = 'brevo' as const;

  constructor(private readonly config: MailConfig) {}

  async send(mail: OutgoingMail): Promise<{ messageId?: string }> {
    const address = this.config.fromAddress!;
    const response = await fetch(this.config.brevoApiUrl, {
      method: 'POST',
      headers: { 'api-key': this.config.brevoApiKey!, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: this.config.fromName, email: address },
        to: [{ email: mail.to }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
        ...(mail.replyTo ? { replyTo: { email: mail.replyTo } } : {}),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { messageId?: string; message?: string };
    if (!response.ok) {
      throw new Error(`Brevo respondió ${response.status}: ${body.message ?? 'error desconocido'}`);
    }
    return { messageId: body.messageId };
  }
}
