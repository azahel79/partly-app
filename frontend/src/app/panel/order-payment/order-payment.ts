import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProviderOrdersService } from '../../shared/provider-orders.service';
import { CommissionsService } from '../../shared/commissions.service';
import { ConfirmService } from '../../shared/confirm.service';
import { ProviderOrder, ProviderOrderKind } from '../../shared/provider-orders.models';
import { PlatformBankAccount } from '../../shared/commissions.models';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const KIND_LABEL: Record<ProviderOrderKind, string> = { PURCHASE: 'Compra', RENEWAL: 'Renovación', REPLACEMENT: 'Reposición' };

/** Pagar una compra al mayoreo: transferir a la cuenta de Partly, subir el comprobante y esperar la validación. */
@Component({
  imports: [RouterLink, PlatformLogo],
  selector: 'app-order-payment',
  styleUrl: './order-payment.css',
  templateUrl: './order-payment.html',
})
export class OrderPayment implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ordersService = inject(ProviderOrdersService);
  private readonly commissionsService = inject(CommissionsService);
  private readonly confirmService = inject(ConfirmService);

  protected readonly order = signal<ProviderOrder | null | undefined>(undefined);
  protected readonly bank = signal<PlatformBankAccount | null | undefined>(undefined);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly selectedFile = signal<File | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly cancelling = signal(false);
  protected readonly viewingReceipt = signal(false);
  protected readonly copiedField = signal<string | null>(null);

  /** Reloj para la cuenta regresiva del plazo de pago. */
  private readonly now = signal(Date.now());
  private tick: ReturnType<typeof setInterval> | undefined;

  protected readonly kindLabel = computed(() => {
    const o = this.order();
    return o ? KIND_LABEL[o.kind] : '';
  });

  /** Etapa del proceso (1 reserva, 2 pago, 3 validación, 4 entrega) para la barra de pasos. */
  protected readonly stage = computed(() => {
    switch (this.order()?.status) {
      case 'AWAITING_PAYMENT': return 2;
      case 'PENDING_APPROVAL': return 3;
      case 'PENDING_DELIVERY': return 4;
      case 'FULFILLED': return 5;
      default: return 0;
    }
  });

  protected readonly timeLeft = computed(() => {
    const due = this.order()?.paymentDueAt;
    if (!due) return null;
    const ms = new Date(due).getTime() - this.now();
    if (ms <= 0) return { expired: true, label: 'Venció' };
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    return { expired: false, label: hours >= 1 ? `${hours} h ${minutes} min` : `${minutes} min` };
  });

  private readonly money$ = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

  private get orderId(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    this.load();
    this.commissionsService.getBankAccount().subscribe({ next: (b) => this.bank.set(b), error: () => this.bank.set(null) });
    this.tick = setInterval(() => this.now.set(Date.now()), 30_000);
  }

  ngOnDestroy(): void {
    if (this.tick) clearInterval(this.tick);
  }

  private load(): void {
    this.ordersService.findById(this.orderId).subscribe({
      next: (order) => this.order.set(order),
      error: (message: string) => {
        this.order.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  protected money(value: string | number): string {
    return this.money$.format(Number(value));
  }

  /** Monto con dos decimales, sin símbolo (para copiarlo tal cual a la transferencia). */
  protected plain(value: string | number): string {
    return Number(value).toFixed(2);
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  protected formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  protected onFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.setFile(input.files?.[0] ?? null);
    input.value = '';
  }

  protected onFileDropped(event: DragEvent): void {
    event.preventDefault();
    this.setFile(event.dataTransfer?.files?.[0] ?? null);
  }

  private setFile(file: File | null): void {
    this.fileError.set(null);
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      this.fileError.set('Solo se aceptan imágenes JPG, PNG, WEBP o PDF.');
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      this.fileError.set('El archivo pesa más de 8 MB.');
      return;
    }
    this.selectedFile.set(file);
  }

  protected upload(): void {
    const file = this.selectedFile();
    if (!file || this.uploading()) return;
    this.uploading.set(true);
    this.errorMessage.set(null);
    this.ordersService.uploadReceipt(this.orderId, file).subscribe({
      next: (order) => {
        this.uploading.set(false);
        this.selectedFile.set(null);
        this.order.set(order);
      },
      error: (message: string) => {
        this.uploading.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected viewReceipt(): void {
    if (this.viewingReceipt()) return;
    this.viewingReceipt.set(true);
    this.ordersService.getReceiptBlob(this.orderId).subscribe({
      next: (blob) => {
        this.viewingReceipt.set(false);
        window.open(URL.createObjectURL(blob), '_blank');
      },
      error: () => this.viewingReceipt.set(false),
    });
  }

  protected async cancel(): Promise<void> {
    const order = this.order();
    if (!order || this.cancelling()) return;
    const ok = await this.confirmService.ask({
      title: order.kind === 'RENEWAL' ? '¿Retirar la renovación?' : '¿Retirar la reserva?',
      text: 'No pierdes nada: la cuenta vuelve al inventario y puedes reservarla de nuevo cuando quieras.',
      confirmText: 'Sí, retirar',
      cancelText: 'Volver',
      danger: true,
    });
    if (!ok) return;
    this.cancelling.set(true);
    this.ordersService.cancel(order.id).subscribe({
      next: (updated) => {
        this.cancelling.set(false);
        this.order.set(updated);
      },
      error: (message: string) => {
        this.cancelling.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected async copy(field: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.copiedField.set(field);
      setTimeout(() => this.copiedField.set(null), 1800);
    } catch {
      this.copiedField.set(null);
    }
  }

  protected goToMayoreo(): void {
    this.router.navigateByUrl('/panel/mayoreo');
  }
}
