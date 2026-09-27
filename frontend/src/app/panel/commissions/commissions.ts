import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommissionsService } from '../../shared/commissions.service';
import { CommissionCharge, CommissionChargeStatus, MyCommissions } from '../../shared/commissions.models';
import { formatMoney } from '../../shared/money';

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const STATUS: Record<CommissionChargeStatus, { label: string; tone: string }> = {
  PENDING: { label: 'Por pagar', tone: 'bg-amber-50 text-amber-800' },
  IN_REVIEW: { label: 'En revisión', tone: 'bg-blue-50 text-blue-700' },
  PAID: { label: 'Pagada', tone: 'bg-emerald-50 text-emerald-700' },
};

/** La comisión que el vendedor le paga a Partly: se transfiere a la cuenta de Partly y se sube el comprobante. */
@Component({
  imports: [RouterLink],
  selector: 'app-commissions',
  styleUrl: './commissions.css',
  templateUrl: './commissions.html',
})
export class CommissionsPage implements OnInit {
  private readonly commissionsService = inject(CommissionsService);

  protected readonly statusLabel = STATUS;
  protected readonly data = signal<MyCommissions | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly selectedFiles = signal<Record<string, File>>({});
  protected readonly fileErrors = signal<Record<string, string>>({});
  protected readonly uploadingId = signal<string | null>(null);
  protected readonly viewingId = signal<string | null>(null);
  protected readonly copiedField = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly pending = computed(() => (this.data()?.charges ?? []).filter((c) => c.status === 'PENDING'));
  protected readonly inReview = computed(() => (this.data()?.charges ?? []).filter((c) => c.status === 'IN_REVIEW'));
  protected readonly history = computed(() => (this.data()?.charges ?? []).filter((c) => c.status !== 'PENDING'));
  protected readonly toPayTotal = computed(() => this.pending().reduce((sum, c) => sum + c.amount, 0));

  ngOnInit(): void {
    this.commissionsService.refreshStatus();
    this.load();
  }

  private load(): void {
    this.commissionsService.getMine().subscribe({
      next: (data) => this.data.set(data),
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  protected money(value: number): string {
    return formatMoney(value);
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /** Días que le quedan para pagar antes de la restricción (negativo = ya venció). */
  protected daysLeft(charge: CommissionCharge): number {
    return Math.ceil((new Date(charge.payBy).getTime() - Date.now()) / 86_400_000);
  }

  protected onFileChosen(chargeId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.setFile(chargeId, input.files?.[0] ?? null);
    input.value = '';
  }

  protected onFileDropped(chargeId: string, event: DragEvent): void {
    event.preventDefault();
    this.setFile(chargeId, event.dataTransfer?.files?.[0] ?? null);
  }

  private setFile(chargeId: string, file: File | null): void {
    this.fileErrors.update((map) => ({ ...map, [chargeId]: '' }));
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      this.fileErrors.update((map) => ({ ...map, [chargeId]: 'Solo se aceptan imágenes JPG, PNG, WEBP o PDF.' }));
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      this.fileErrors.update((map) => ({ ...map, [chargeId]: 'El archivo pesa más de 8 MB.' }));
      return;
    }
    this.selectedFiles.update((map) => ({ ...map, [chargeId]: file }));
  }

  protected upload(charge: CommissionCharge): void {
    const file = this.selectedFiles()[charge.id];
    if (!file || this.uploadingId()) return;
    this.uploadingId.set(charge.id);
    this.errorMessage.set(null);
    this.commissionsService.uploadReceipt(charge.id, file).subscribe({
      next: () => {
        this.uploadingId.set(null);
        this.selectedFiles.update((map) => {
          const { [charge.id]: _removed, ...rest } = map;
          return rest;
        });
        this.notice.set('Comprobante enviado. Partly lo revisará y te avisaremos cuando quede validado.');
        this.load();
      },
      error: (message: string) => {
        this.uploadingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  protected viewReceipt(charge: CommissionCharge): void {
    if (this.viewingId()) return;
    this.viewingId.set(charge.id);
    this.commissionsService.getReceiptBlob(charge.id).subscribe({
      next: (blob) => {
        this.viewingId.set(null);
        window.open(URL.createObjectURL(blob), '_blank');
      },
      error: () => this.viewingId.set(null),
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
}
