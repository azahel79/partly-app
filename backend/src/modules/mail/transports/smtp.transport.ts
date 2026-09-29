import * as nodemailer from 'nodemailer';
import { EMAIL_LOGO_CID, EMAIL_LOGO_FILE, EMAIL_LOGO_PNG_BASE64, emailLogoUrl, isPublicUrl } from '../mail-logo';
import { MailConfig, MailTransport, OutgoingMail } from '../mail.types';

/** SMTP genérico (Gmail, Zoho, el del hosting, Mailgun...): sirve para probar con una cuenta normal aun sin dominio propio. */
export class SmtpTransport implements MailTransport {
  readonly name = 'smtp' as const;
  private readonly transporter: nodemailer.Transporter;
  /** Sin URL pública (desarrollo) el logo va adjunto dentro del correo: Gmail no puede descargarlo de localhost. */
  private readonly inlineLogoUrl: string | null;

  constructor(config: MailConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });
    this.inlineLogoUrl = isPublicUrl(config.appUrl) ? null : emailLogoUrl(config.appUrl);
  }

  async send(mail: OutgoingMail): Promise<{ messageId?: string }> {
    let html = mail.html;
    const attachments: nodemailer.SendMailOptions['attachments'] = [];
    if (this.inlineLogoUrl && html.includes(this.inlineLogoUrl)) {
      html = html.split(this.inlineLogoUrl).join(`cid:${EMAIL_LOGO_CID}`);
      attachments.push({ filename: EMAIL_LOGO_FILE, content: Buffer.from(EMAIL_LOGO_PNG_BASE64, 'base64'), cid: EMAIL_LOGO_CID, contentType: 'image/png' });
    }
    const info = await this.transporter.sendMail({
      from: mail.from,
      to: mail.to,
      replyTo: mail.replyTo,
      subject: mail.subject,
      html,
      text: mail.text,
      attachments,
    });
    return { messageId: info.messageId };
  }
}
