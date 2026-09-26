import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MailService } from '../../shared/mail.service';
import { EmailStatus, MailMessageDetail, MailMessageSummary, MailProviderName, MailStatus } from '../../shared/mail.models';

type Filter = EmailStatus | '';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'QUEUED', label: 'En cola' },
  { value: 'SENT', label: 'Enviados' },
  { value: 'FAILED', label: 'Fallidos' },
  { value: 'SKIPPED', label: 'Omitidos' },
];

const STATUS: Record<EmailStatus, { label: string; tone: string }> = {
  QUEUED: { label: 'En cola', tone: 'bg-amber-100 text-amber-800' },
  SENDING: { label: 'Enviando', tone: 'bg-blue-100 text-blue-800' },
  SENT: { label: 'Enviado', tone: 'bg-emerald-100 text-emerald-800' },
  FAILED: { label: 'Fallido', tone: 'bg-red-100 text-red-700' },
  SKIPPED: { label: 'Omitido', tone: 'bg-slate-100 text-slate-600' },
};

const TEMPLATE_LABEL: Record<string, string> = {
  test: 'Prueba',
  notice: 'Aviso',
  'password-reset': 'Restablecer contraseña',
  'google-account': 'Cuenta de Google',
  'notification-payment_due_soon': 'Recordatorio de pago',
  'notification-payment_confirmed': 'Pago confirmado',
  'notification-payment_failed': 'Pago fallido',
  'notification-payment_receipt_rejected': 'Comprobante rechazado',
  'notification-payment_receipt_uploaded': 'Comprobante por revisar',
  'notification-membership_cancelled': 'Membresía cancelada',
  'notification-credential_updated': 'Credenciales cambiadas',
  'notification-commission_due': 'Comisión por pagar',
  'notification-commission_reminder': 'Recordatorio de comisión',
  'notification-commission_overdue': 'Comisión vencida',
  'notification-commission_paid': 'Comisión pagada',
  'notification-commission_rejected': 'Comisión rechazada',
  'notification-system': 'Aviso general',
};

const PROVIDER_LABEL: Record<MailProviderName, string> = { log: 'Simulado', resend: 'Resend', brevo: 'Brevo', smtp: 'SMTP' };

const ENV_SNIPPETS: Record<'resend' | 'brevo' | 'smtp', string> = {
  resend: 'MAIL_PROVIDER=resend\nMAIL_FROM_NAME=Partly\nMAIL_FROM_ADDRESS=no-reply@tu-dominio.com\nRESEND_API_KEY=re_xxxxxxxx',
  brevo: 'MAIL_PROVIDER=brevo\nMAIL_FROM_NAME=Partly\nMAIL_FROM_ADDRESS=no-reply@tu-dominio.com\nBREVO_API_KEY=xkeysib-xxxxxxxx',
  smtp: 'MAIL_PROVIDER=smtp\nMAIL_FROM_NAME=Partly\nMAIL_FROM_ADDRESS=no-reply@tu-dominio.com\nSMTP_HOST=smtp.tu-proveedor.com\nSMTP_PORT=587\nSMTP_SECURE=false\nSMTP_USER=usuario\nSMTP_PASS=contraseña',
};

/** Bandeja de salida: qué correos salieron (o se simularon), cuáles fallaron y cómo activar el envío real. */
@Component({
  selector: 'app-mail-outbox',
  styleUrl: './mail-outbox.css',
  templateUrl: './mail-outbox.html',
})
export class MailOutbox implements OnInit {
  private readonly mailService = inject(MailService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly filters = FILTERS;
  protected readonly statusLabel = STATUS;
  protected readonly providerLabel = PROVIDER_LABEL;
  protected readonly snippetTabs = [
    { key: 'resend' as const, label: 'Resend' },
    { key: 'brevo' as const, label: 'Brevo' },
    { key: 'smtp' as const, label: 'SMTP' },
  ];

  protected readonly status = signal<MailStatus | null>(null);
  protected readonly filter = signal<Filter>('');
  protected readonly search = signal('');
  protected readonly messages = signal<MailMessageSummary[] | null>(null);
  protected readonly total = signal(0);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly testing = signal(false);
  protected readonly retryingId = signal<string | null>(null);

  protected readonly guideOpen = signal(false);
  protected readonly snippetTab = signal<'resend' | 'brevo' | 'smtp'>('resend');
  protected readonly snippet = computed(() => ENV_SNIPPETS[this.snippetTab()]);
  protected readonly snippetCopied = signal(false);

  protected readonly preview = signal<MailMessageDetail | null>(null);
  protected readonly previewHtml = computed<SafeHtml | null>(() => {
    const p = this.preview();
    return p ? this.sanitizer.bypassSecurityTrustHtml(p.html) : null;
  });
  protected readonly loadingPreviewId = signal<string | null>(null);

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    this.loadStatus();
    this.load();
  }

  private loadStatus(): void {
    this.mailService.getStatus().subscribe({ next: (s) => this.status.set(s), error: (message: string) => this.errorMessage.set(message) });
  }

  protected setFilter(value: Filter): void {
    this.filter.set(value);
    this.load();
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 350);
  }

  protected load(): void {
    this.messages.set(null);
    this.mailService.list(this.filter(), this.search()).subscribe({
      next: (page) => {
        this.messages.set(page.data);
        this.total.set(page.total);
      },
      error: (message: string) => {
        this.errorMessage.set(message);
        this.messages.set([]);
      },
    });
  }

  protected sendTest(): void {
    if (this.testing()) return;
    this.testing.set(true);
    this.errorMessage.set(null);
    this.notice.set(null);
    this.mailService.sendTest().subscribe({
      next: (message) => {
        this.testing.set(false);
        this.notice.set(
          message.status === 'SENT'
            ? this.status()?.simulated
              ? `Correo de prueba generado en modo simulado (no salió de la app). Ábrelo abajo para ver cómo se ve.`
              : `Correo de prueba enviado a ${message.toEmail} por ${message.provider}. Revisa tu bandeja.`
            : `El correo de prueba quedó ${STATUS[message.status].label.toLowerCase()}: ${message.error ?? 'revisa la configuración'}.`,
        );
        this.loadStatus();
        this.load();
      },
      error: (message: string) => {
        this.testing.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected retry(message: MailMessageSummary): void {
    if (this.retryingId()) return;
    this.retryingId.set(message.id);
    this.mailService.retry(message.id).subscribe({
      next: () => {
        this.retryingId.set(null);
        this.loadStatus();
        this.load();
      },
      error: (error: string) => {
        this.retryingId.set(null);
        this.errorMessage.set(error);
      },
    });
  }

  protected openPreview(message: MailMessageSummary): void {
    if (this.loadingPreviewId()) return;
    this.loadingPreviewId.set(message.id);
    this.mailService.findOne(message.id).subscribe({
      next: (detail) => {
        this.loadingPreviewId.set(null);
        this.preview.set(detail);
      },
      error: (error: string) => {
        this.loadingPreviewId.set(null);
        this.errorMessage.set(error);
      },
    });
  }

  protected async copySnippet(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.snippet());
      this.snippetCopied.set(true);
      setTimeout(() => this.snippetCopied.set(false), 1800);
    } catch {
      this.snippetCopied.set(false);
    }
  }

  protected templateLabel(key: string): string {
    return TEMPLATE_LABEL[key] ?? key.replace(/^notification-/, '').replace(/_/g, ' ');
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}
