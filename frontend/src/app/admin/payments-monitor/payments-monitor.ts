import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminPayment, AdminPaymentsPage, AdminReceiptFilter, PaymentStatus } from '../../shared/payments.models';
import { PaymentsService } from '../../shared/payments.service';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';
import { MoneyPipe } from '../../shared/money';

type MonitorFilter = 'ALL' | 'MISSING' | 'UPLOADED' | 'PAID' | 'FAILED';

const PAGE_SIZE = 25;
const SEARCH_DELAY_MS = 300;

@Component({
  selector: 'app-payments-monitor',
  imports: [RouterLink, PlatformLogo, MoneyPipe],
  templateUrl: './payments-monitor.html',
  styleUrl: './payments-monitor.css',
})
export class PaymentsMonitor implements OnInit {
  private readonly paymentsService = inject(PaymentsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly page = signal<AdminPaymentsPage | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly activeFilter = signal<MonitorFilter>('ALL');
  protected readonly currentPage = signal(1);
  protected readonly search = signal('');
  protected readonly viewingId = signal<string | null>(null);
  protected readonly remindingId = signal<string | null>(null);
  protected readonly bulkSending = signal(false);
  protected readonly notice = signal<string | null>(null);
  /** Pagos pendientes marcados para recordar de una vez. */
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly filters: Array<{ value: MonitorFilter; label: string }> = [
    { value: 'ALL', label: 'Todos' },
    { value: 'MISSING', label: 'Sin comprobante' },
    { value: 'UPLOADED', label: 'Por revisar' },
    { value: 'PAID', label: 'Aprobados' },
    { value: 'FAILED', label: 'Vencidos' },
  ];

  protected readonly metricCards: Array<{ filter: MonitorFilter; label: string; dot: string; count: keyof AdminPaymentsPage['counts'] }> = [
    { filter: 'MISSING', label: 'Sin comprobante', dot: '#f79009', count: 'missingReceipt' },
    { filter: 'UPLOADED', label: 'Por revisar', dot: '#2e90fa', count: 'awaitingSeller' },
    { filter: 'PAID', label: 'Aprobados', dot: '#17b26a', count: 'approved' },
    { filter: 'FAILED', label: 'Vencidos', dot: '#f04438', count: 'failed' },
  ];

  /** Solo los pendientes admiten recordatorio: sin comprobante → comprador; con comprobante → vendedor. */
  protected readonly remindableOnPage = computed(() => (this.page()?.data ?? []).filter((p) => p.status === 'PENDING'));
  protected readonly allSelected = computed(() => {
    const ids = this.remindableOnPage();
    return ids.length > 0 && ids.every((p) => this.selected().has(p.id));
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.searchTimer) clearTimeout(this.searchTimer);
    });
  }

  ngOnInit(): void {
    this.load();
  }

  protected setFilter(filter: MonitorFilter): void {
    this.activeFilter.set(filter);
    this.currentPage.set(1);
    this.load();
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.currentPage.set(1);
      this.load();
    }, SEARCH_DELAY_MS);
  }

  protected goToPage(page: number): void {
    this.currentPage.set(page);
    this.load();
  }

  protected load(): void {
    const filter = this.activeFilter();
    const status: PaymentStatus | '' = filter === 'PAID' || filter === 'FAILED' ? filter : filter === 'MISSING' || filter === 'UPLOADED' ? 'PENDING' : '';
    const receipt: AdminReceiptFilter = filter === 'MISSING' || filter === 'UPLOADED' ? filter : '';
    this.page.set(null);
    this.errorMessage.set(null);
    this.selected.set(new Set());
    this.paymentsService.findAllForAdmin(status, receipt, this.currentPage(), PAGE_SIZE, undefined, this.search().trim()).subscribe({
      next: (page) => this.page.set(page),
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  protected toggleSelected(id: string): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected toggleAll(): void {
    this.selected.set(this.allSelected() ? new Set() : new Set(this.remindableOnPage().map((p) => p.id)));
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
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
    if (this.remindingId() || this.bulkSending()) return;
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

  /**
   * Recuerda a todos los seleccionados, uno tras otro. El backend limita a un recordatorio por
   * persona al día, así que algunos pueden rechazarse: se informa cuántos salieron y cuántos no.
   */
  protected async remindSelected(): Promise<void> {
    const payments = (this.page()?.data ?? []).filter((p) => this.selected().has(p.id));
    if (payments.length === 0 || this.bulkSending()) return;
    this.bulkSending.set(true);
    this.errorMessage.set(null);
    this.notice.set(null);
    const sentTo = new Set<string>();
    const failures: string[] = [];
    for (const payment of payments) {
      try {
        const result = await firstValueFrom(this.paymentsService.sendReminder(payment.id));
        sentTo.add(result.name);
      } catch (message) {
        failures.push(`${payment.buyer.name}: ${message}`);
      }
    }
    this.bulkSending.set(false);
    this.selected.set(new Set());
    const ok = sentTo.size > 0 ? `Recordatorio enviado a ${[...sentTo].join(', ')}.` : 'No se envió ningún recordatorio.';
    this.notice.set(failures.length > 0 ? `${ok} No se pudo con ${failures.length}: ${failures.join(' · ')}` : ok);
  }

  protected statusLabel(payment: AdminPayment): string {
    if (payment.status === 'PAID') return 'Aprobado';
    if (payment.status === 'FAILED') return 'Vencido';
    return payment.receiptUploadedAt ? 'Por revisar' : 'Falta comprobante';
  }

  protected statusTone(payment: AdminPayment): string {
    if (payment.status === 'PAID') return 'ui-pill--ok';
    if (payment.status === 'FAILED') return 'ui-pill--danger';
    return payment.receiptUploadedAt ? 'ui-pill--info' : 'ui-pill--warn';
  }

  protected shortDate(value: string): string {
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(value)).replace('.', '');
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
