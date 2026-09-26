import { Logger } from '@nestjs/common';
import { MailTransport, OutgoingMail } from '../mail.types';

/** Modo simulado: no envía nada, solo lo deja en el registro. El mensaje ya queda guardado en la bandeja de salida. */
export class LogTransport implements MailTransport {
  readonly name = 'log' as const;
  private readonly logger = new Logger('MailSimulado');

  async send(mail: OutgoingMail): Promise<{ messageId?: string }> {
    // El primer enlace del correo (ej. el de restablecer contraseña) se muestra para poder probar el flujo sin proveedor real.
    const link = mail.text.match(/https?:\/\/\S+/)?.[0];
    this.logger.log(`[SIMULADO] Correo a ${mail.to} — "${mail.subject}"${link ? ` → ${link}` : ''}`);
    return {};
  }
}
