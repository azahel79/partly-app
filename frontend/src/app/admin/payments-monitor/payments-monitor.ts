import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminPayment, AdminPaymentsPage, AdminReceiptFilter, PaymentStatus } from '../../shared/payments.models';
import { PaymentsService } from '../../shared/payments.service';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';

type MonitorFilter = 'ALL' | 'MISSING' | 'UPLOADED' | 'PAID' | 'FAILED';

@Component({
  selector: 'app-payments-monitor',
  imports: [RouterLink, PlatformLogo],
  templateUrl: './payments-monitor.html',
  styleUrl: './payments-monitor.css',
})
export class PaymentsMonitor implements OnInit {
  private readonly paymentsService = inject(PaymentsService);

  protected readonly page = signal<AdminPaymentsPage | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly activeFilter = signal<MonitorFilter>('ALL');
  protected readonly viewingId = signal<string | null>(null);
  protected readonly remindingId = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly brokenLogos = signal<ReadonlySet<string>>(new Set());

  protected markBroken(id: string): void {
    this.brokenLogos.update((s) => new Set(s).add(id));
  }

  protected readonly filters: Array<{ value: MonitorFilter; label: string; icon: string }> = [
    { value: 'ALL', label: 'Todos', icon: 'layers' },
    { value: 'MISSING', label: 'Sin comprobante', icon: 'upload_file' },
    { value: 'UPLOADED', label: 'Por revisar', icon: 'manage_search' },
    { value: 'PAID', label: 'Aprobados', icon: 'verified' },
    { value: 'FAILED', label: 'Vencidos', icon: 'event_busy' },
  ];

  protected statusIcon(payment: AdminPayment): string {
    if (payment.status === 'PAID') return 'check_circle';
    if (payment.status === 'FAILED') return 'event_busy';
    return payment.receiptUploadedAt ? 'hourglass_top' : 'error';
  }

  ngOnInit(): void {
    this.load();
  }

  protected setFilter(filter: MonitorFilter): void {
    this.activeFilter.set(filter);
    this.load();
  }

  protected load(): void {
    const filter = this.activeFilter();
    const status: PaymentStatus | '' = filter === 'PAID' || filter === 'FAILED' ? filter : filter === 'MISSING' || filter === 'UPLOADED' ? 'PENDING' : '';
    const receipt: AdminReceiptFilter = filter === 'MISSING' || filter === 'UPLOADED' ? filter : '';
    this.page.set(null);
    this.errorMessage.set(null);
    this.paymentsService.findAllForAdmin(status, receipt).subscribe({
      next: (page) => this.page.set(page),
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  protected viewReceipt(payment: AdminPayment): void {
    if (!payment.receiptUploadedAt || this.viewingId()) return;
    this.viewingId.set(payment.id);
    this.paymentsService.getReceiptBlob(payment.group.id, payment.id).subscribe({
      next: (blob) => {
        this.viewingId.set(null);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (message: string) => {
        this.viewingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  /** Recordatorio por la app y por correo: al comprador si falta su comprobante, al vendedor si ya lo subió. */
  protected sendReminder(payment: AdminPayment): void {
    if (this.remindingId()) return;
    this.remindingId.set(payment.id);
    this.errorMessage.set(null);
    this.notice.set(null);
    this.paymentsService.sendReminder(payment.id).subscribe({
      next: (result) => {
        this.remindingId.set(null);
        const channels = [result.inApp ? 'en la app' : null, result.email ? 'por correo' : null].filter(Boolean).join(' y ');
        this.notice.set(`Recordatorio enviado a ${result.name} (${result.sentTo === 'SELLER' ? 'vendedor' : 'comprador'})${channels ? ' ' + channels : ', aunque tiene los avisos desactivados'}.`);
      },
      error: (message: string) => {
        this.remindingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  protected statusLabel(payment: AdminPayment): string {
    if (payment.status === 'PAID') return 'Aprobado por vendedor';
    if (payment.status === 'FAILED') return 'Vencido';
    return payment.receiptUploadedAt ? 'Esperando al vendedor' : 'Falta comprobante';
  }

  protected statusClass(payment: AdminPayment): string {
    if (payment.status === 'PAID') return 'approved';
    if (payment.status === 'FAILED') return 'failed';
    return payment.receiptUploadedAt ? 'waiting' : 'missing';
  }

  protected initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
  }

  protected formatDate(value: string, includeTime = false): string {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(new Date(value));
  }
}
