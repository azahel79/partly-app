import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommissionsService } from '../../shared/commissions.service';
import { ConfirmService } from '../../shared/confirm.service';
import { inspectClabe } from '../../shared/clabe.util';
import {
  AdminCommissionCharge,
  AdminCommissionsSummary,
  AdminRateRequest,
  CommissionChargeStatus,
  PlatformBankAccount,
} from '../../shared/commissions.models';
import { formatMoney } from '../../shared/money';

type QueueFilter = 'REVIEW' | 'PENDING' | 'OVERDUE' | 'PAID' | 'ALL';

const FILTERS: Array<{ value: QueueFilter; label: string }> = [
  { value: 'REVIEW', label: 'Por revisar' },
  { value: 'PENDING', label: 'Por cobrar' },
  { value: 'OVERDUE', label: 'Vencidas' },
  { value: 'PAID', label: 'Pagadas' },
  { value: 'ALL', label: 'Todas' },
];

const STATUS: Record<CommissionChargeStatus, { label: string; tone: string }> = {
  PENDING: { label: 'Por pagar', tone: 'bg-amber-100 text-amber-800' },
  IN_REVIEW: { label: 'En revisión', tone: 'bg-blue-100 text-blue-800' },
  PAID: { label: 'Pagada', tone: 'bg-emerald-100 text-emerald-800' },
};

/** Cola del admin: revisa los comprobantes de comisión de los vendedores y configura la cuenta de Tequio. */
@Component({
  selector: 'app-commissions-queue',
  styleUrl: './commissions-queue.css',
  templateUrl: './commissions-queue.html',
})
export class CommissionsQueue implements OnInit {
  private readonly commissionsService = inject(CommissionsService);
  private readonly confirmService = inject(ConfirmService);

  protected readonly filters = FILTERS;
  protected readonly statusLabel = STATUS;
  protected readonly filter = signal<QueueFilter>('REVIEW');
  protected readonly charges = signal<AdminCommissionCharge[] | null>(null);
  protected readonly summary = signal<AdminCommissionsSummary | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly actingId = signal<string | null>(null);
  protected readonly viewingId = signal<string | null>(null);
  protected readonly remindingId = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  /** Solicitudes de comisión reducida pendientes y el porcentaje que el admin va a autorizar en cada una. */
  protected readonly rateRequests = signal<AdminRateRequest[] | null>(null);
  protected readonly rateInputs = signal<Record<string, number>>({});
  protected readonly minRate = signal(6);
  protected readonly rateActingId = signal<string | null>(null);

  // cuenta bancaria de Tequio
  protected readonly bank = signal<PlatformBankAccount | null | undefined>(undefined);
  protected readonly editingBank = signal(false);
  protected readonly savingBank = signal(false);
  protected readonly bankMessage = signal<string | null>(null);
  protected readonly bankHolder = signal('');
  protected readonly bankClabe = signal('');
  protected readonly bankReference = signal('');
  protected readonly clabeInfo = computed(() => inspectClabe(this.bankClabe()));
  protected readonly canSaveBank = computed(() => this.bankHolder().trim().length >= 3 && this.clabeInfo().isValid && !!this.clabeInfo().bankName);

  ngOnInit(): void {
    this.loadSummary();
    this.loadCharges();
    this.loadRateRequests();
    this.commissionsService.getBankAccount().subscribe({
      next: (account) => {
        this.bank.set(account);
        this.editingBank.set(account === null);
        if (account) this.fillBankForm(account);
      },
      error: () => this.bank.set(null),
    });
  }

  protected setFilter(value: QueueFilter): void {
    this.filter.set(value);
    this.loadCharges();
  }

  private loadSummary(): void {
    this.commissionsService.getAdminSummary().subscribe({ next: (s) => this.summary.set(s), error: () => undefined });
  }

  private loadCharges(): void {
    this.charges.set(null);
    const filter = this.filter();
    const status: CommissionChargeStatus | '' = filter === 'REVIEW' ? 'IN_REVIEW' : filter === 'PENDING' || filter === 'OVERDUE' ? 'PENDING' : filter === 'PAID' ? 'PAID' : '';
    this.commissionsService.findAllForAdmin(status, filter === 'OVERDUE').subscribe({
      next: (page) => this.charges.set(page.data),
      error: (message: string) => {
        this.errorMessage.set(message);
        this.charges.set([]);
      },
    });
  }

  protected money(value: number): string {
    return formatMoney(value);
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // ---- revisión
  protected async approve(charge: AdminCommissionCharge): Promise<void> {
    if (this.actingId()) return;
    const ok = await this.confirmService.ask({
      title: `¿Ya llegó la transferencia de ${this.money(charge.amount)}?`,
      text: `Confirma en tu banco que ${charge.seller.name} te depositó ese monto. Sus ganancias quedarán liquidadas.`,
      confirmText: 'Sí, ya llegó',
    });
    if (!ok) return;
    this.review(charge, true);
  }

  protected async reject(charge: AdminCommissionCharge): Promise<void> {
    if (this.actingId()) return;
    const reason = await this.confirmService.prompt({
      title: 'Rechazar comprobante',
      text: 'El vendedor verá el motivo y podrá subir otro.',
      placeholder: 'Ej. El monto de la transferencia no coincide.',
      confirmText: 'Rechazar',
      required: true,
    });
    if (reason === null) return;
    this.review(charge, false, reason);
  }

  private review(charge: AdminCommissionCharge, approve: boolean, reason?: string): void {
    this.actingId.set(charge.id);
    this.errorMessage.set(null);
    this.commissionsService.review(charge.id, approve, reason).subscribe({
      next: () => {
        this.actingId.set(null);
        this.loadSummary();
        this.loadCharges();
      },
      error: (message: string) => {
        this.actingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  protected sendReminder(charge: AdminCommissionCharge): void {
    if (this.remindingId()) return;
    this.remindingId.set(charge.id);
    this.errorMessage.set(null);
    this.notice.set(null);
    this.commissionsService.sendReminder(charge.id).subscribe({
      next: (result) => {
        this.remindingId.set(null);
        const channels = [result.inApp ? 'en la app' : null, result.email ? 'por correo' : null].filter(Boolean).join(' y ');
        this.notice.set(`Recordatorio enviado a ${result.name}${channels ? ' ' + channels : ', aunque tiene los avisos desactivados'}.`);
      },
      error: (message: string) => {
        this.remindingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  protected viewReceipt(charge: AdminCommissionCharge): void {
    if (this.viewingId()) return;
    this.viewingId.set(charge.id);
    this.commissionsService.getReceiptBlob(charge.id).subscribe({
      next: (blob) => {
        this.viewingId.set(null);
        window.open(URL.createObjectURL(blob), '_blank');
      },
      error: (message: string) => {
        this.viewingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  // ---- cuenta bancaria
  private fillBankForm(account: PlatformBankAccount): void {
    this.bankHolder.set(account.holder);
    this.bankClabe.set(account.clabe);
    this.bankReference.set(account.reference ?? '');
  }

  protected startEditBank(): void {
    this.bankMessage.set(null);
    this.editingBank.set(true);
  }

  protected cancelEditBank(): void {
    const account = this.bank();
    if (account) {
      this.fillBankForm(account);
      this.editingBank.set(false);
    }
  }

  protected onClabeInput(value: string): void {
    this.bankClabe.set(value.replace(/\D/g, '').slice(0, 18));
  }

  protected saveBank(): void {
    if (!this.canSaveBank() || this.savingBank()) return;
    this.savingBank.set(true);
    this.bankMessage.set(null);
    this.commissionsService
      .updateBankAccount({
        holder: this.bankHolder().trim(),
        bankName: this.clabeInfo().bankName!,
        clabe: this.clabeInfo().digits,
        reference: this.bankReference().trim() || undefined,
      })
      .subscribe({
        next: (account) => {
          this.savingBank.set(false);
          this.bank.set(account);
          this.editingBank.set(false);
          this.bankMessage.set('Cuenta guardada. Los vendedores ya la ven al pagar su comisión.');
        },
        error: (message: string) => {
          this.savingBank.set(false);
          this.bankMessage.set(message);
        },
      });
  }

  private loadRateRequests(): void {
    this.commissionsService.findRateRequests('PENDING').subscribe({
      next: (page) => {
        this.minRate.set(page.minRate);
        this.rateRequests.set(page.data);
        // Sugerencia: 2 puntos menos que hoy, sin bajar del mínimo.
        this.rateInputs.set(Object.fromEntries(page.data.map((r) => [r.id, Math.max(page.minRate, r.currentRate - 2)])));
      },
      error: () => this.rateRequests.set([]),
    });
  }

  protected setRateInput(id: string, value: string): void {
    this.rateInputs.update((inputs) => ({ ...inputs, [id]: Number(value) }));
  }

  protected metCount(request: AdminRateRequest): number {
    return request.requirements.filter((r) => r.met).length;
  }

  protected async approveRate(request: AdminRateRequest): Promise<void> {
    const rate = this.rateInputs()[request.id];
    if (this.rateActingId() || !rate) return;
    const ok = await this.confirmService.ask({
      title: `¿Bajar la comisión de ${request.seller.name} a ${rate}%?`,
      text: `Aplica a sus ${request.activeGroups} ${request.activeGroups === 1 ? 'grupo' : 'grupos'} para los pagos que valide desde hoy. Se le avisa por la app y por correo.`,
      confirmText: `Autorizar ${rate}%`,
    });
    if (!ok) return;
    this.reviewRate(request, { approve: true, rate }, `Autorizaste ${rate}% a ${request.seller.name}.`);
  }

  protected async rejectRate(request: AdminRateRequest): Promise<void> {
    if (this.rateActingId()) return;
    const note = await this.confirmService.prompt({
      title: `Rechazar la solicitud de ${request.seller.name}`,
      text: 'Dile qué le falta para que sepa qué mejorar. Podrá volver a pedirla en 30 días.',
      placeholder: 'Ej. Todavía tiene pocas reseñas.',
      confirmText: 'Rechazar',
      required: true,
    });
    if (note === null) return;
    this.reviewRate(request, { approve: false, note }, `Rechazaste la solicitud de ${request.seller.name}.`);
  }

  private reviewRate(request: AdminRateRequest, input: { approve: boolean; rate?: number; note?: string }, done: string): void {
    this.rateActingId.set(request.id);
    this.errorMessage.set(null);
    this.commissionsService.reviewRateRequest(request.id, input).subscribe({
      next: () => {
        this.rateActingId.set(null);
        this.notice.set(done);
        this.rateRequests.update((list) => (list ?? []).filter((r) => r.id !== request.id));
      },
      error: (message: string) => {
        this.rateActingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }
}
