import * as nodemailer from 'nodemailer';
import { MailConfig, MailTransport, OutgoingMail } from '../mail.types';

/** SMTP genérico (Gmail, Zoho, el del hosting, Mailgun...): sirve para probar con una cuenta normal aun sin dominio propio. */
export class SmtpTransport implements MailTransport {
  readonly name = 'smtp' as const;
  private readonly transporter: nodemailer.Transporter;

  constructor(config: MailConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });
  }

  async send(mail: OutgoingMail): Promise<{ messageId?: string }> {
    const info = await this.transporter.sendMail({
      from: mail.from,
      to: mail.to,
      replyTo: mail.replyTo,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    return { messageId: info.messageId };
  }
}
