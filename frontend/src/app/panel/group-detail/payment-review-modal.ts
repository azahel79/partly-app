import { Component, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PaymentsService } from '../../shared/payments.service';
import { PendingPayment } from '../../shared/payments.models';
import { GroupProfile } from '../../shared/groups.models';
import { UiModal } from '../../shared/ui-modal/ui-modal';
import { MoneyPipe } from '../../shared/money';

/**
 * El vendedor revisa el comprobante de un comprador: lo ve ahí mismo, confirma en su banco y aprueba (en el primer pago
 * le asigna un perfil) o lo rechaza con un motivo que el comprador lee. Todo en un solo lugar, sin saturar la lista.
 */
@Component({
  selector: 'app-payment-review-modal',
  imports: [UiModal, MoneyPipe],
  template: `
    <app-ui-modal #modal [title]="'Revisar pago de ' + payment().member.name" [subtitle]="kindLabel()" [wide]="true" [dirty]="dirty()" [busy]="saving()" (closed)="closed.emit()">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div class="flex flex-col gap-2">
        <div class="receipt-frame">
          @if (receiptUrl(); as url) {
            @if (receiptIsPdf()) {
              <iframe [src]="receiptSafeUrl()" title="Comprobante de pago (PDF)"></iframe>
            } @else {
              <a [href]="url" target="_blank" rel="noopener" title="Abrir en grande"><img [src]="url" alt="Comprobante de pago" /></a>
            }
          } @else if (receiptError()) {
            <p class="receipt-empty">{{ receiptError() }}</p>
          } @else {
            <span class="ui-skeleton receipt-skeleton"></span>
          }
        </div>
        @if (receiptUrl(); as url) {
          <a class="ui-link receipt-open" [href]="url" target="_blank" rel="noopener"><span class="material-symbols-outlined">open_in_new</span>Abrir en grande</a>
        }
        </div>

        <div class="flex flex-col gap-4">
          <dl class="ui-summary">
            <dt>Monto</dt>
            <dd>{{ payment().amount | money }}{{ amountDetail() }}</dd>
            @if (payment().coveredUntil) {
              <dt>Cubre hasta</dt>
              <dd>{{ periodLabel(payment().coveredUntil!) }}</dd>
            }
            @if (payment().receiptUploadedAt) {
              <dt>Lo subió</dt>
              <dd>{{ dateTimeLabel(payment().receiptUploadedAt!) }}</dd>
            }
            @if (payment().graceUntil) {
              <dt>Plazo</dt>
              <dd>{{ dateTimeLabel(payment().graceUntil!) }}</dd>
            }
          </dl>

          @if (mode() === 'review') {
            <p class="ui-note ui-note--warn">
              <span class="material-symbols-outlined">account_balance</span>
              <span>Antes de aprobar, revisa en tu banco que sí llegaron <strong>{{ payment().amount | money }}</strong>. {{ isFirstPayment() ? 'Al aprobar, ' + firstName() + ' podrá ver las credenciales de la cuenta.' : 'Al aprobar, ' + firstName() + ' sigue en el grupo el siguiente periodo.' }}</span>
            </p>

            @if (isFirstPayment()) {
              @if (freeProfiles().length > 0) {
                <label class="ui-field">
                  <span>Perfil que le vas a asignar</span>
                  <select class="ui-input" [value]="profileId()" (change)="profileId.set($any($event.target).value)">
                    <option value="" disabled>Elige un perfil libre…</option>
                    @for (profile of freeProfiles(); track profile.id) {
                      <option [value]="profile.id">{{ profile.label }}</option>
                    }
                  </select>
                </label>
              } @else {
                <p class="ui-note ui-note--danger">
                  <span class="material-symbols-outlined">person_off</span>
                  <span>No te queda ningún perfil libre. Agrega uno en "Perfiles de la cuenta" antes de aprobar.</span>
                </p>
              }
            }
          } @else {
            <label class="ui-field">
              <span>¿Por qué lo rechazas? <small>(se lo mostramos a {{ firstName() }})</small></span>
              <textarea class="ui-input" rows="3" [value]="reason()" (input)="reason.set($any($event.target).value)" placeholder="Ej. el monto no coincide o no veo la transferencia en mi banco."></textarea>
            </label>
            <p class="ui-field-hint">Podrá subir otro comprobante dentro de su plazo.</p>
          }

          @if (error()) {
            <p class="ui-note ui-note--danger"><span class="material-symbols-outlined">error</span><span>{{ error() }}</span></p>
          }
        </div>
      </div>

      <div modal-actions>
        @if (mode() === 'review') {
          <button type="button" class="ui-btn ui-btn--ghost-danger" [disabled]="saving()" (click)="mode.set('reject')">Rechazar</button>
          <span class="ui-spacer"></span>
          <button type="button" class="ui-btn ui-btn--secondary" [disabled]="saving()" (click)="modal.close()">Cancelar</button>
          <button type="button" class="ui-btn ui-btn--primary" [disabled]="!canApprove()" (click)="approve()">
            <span class="material-symbols-outlined">check</span>{{ saving() ? 'Aprobando…' : 'Aprobar pago' }}
          </button>
        } @else {
          <button type="button" class="ui-btn ui-btn--secondary" [disabled]="saving()" (click)="mode.set('review')">Volver</button>
          <button type="button" class="ui-btn ui-btn--danger" [disabled]="saving()" (click)="reject()">{{ saving() ? 'Rechazando…' : 'Rechazar comprobante' }}</button>
        }
      </div>
    </app-ui-modal>
  `,
  styles: `
    .receipt-frame { display: flex; align-items: center; justify-content: center; min-height: 260px; max-height: 440px; overflow: auto; border: 1px solid var(--ui-line); border-radius: 12px; background: var(--ui-soft); }
    .receipt-frame img { display: block; width: 100%; height: auto; }
    .receipt-frame iframe { width: 100%; height: 440px; border: 0; }
    .receipt-empty { padding: 24px; color: var(--ui-muted); font-size: 13px; text-align: center; }
    .receipt-skeleton { width: 70%; height: 200px; border-radius: 10px; }
    .receipt-open { align-self: flex-start; font-size: 12px; }
    @media (max-width: 639px) { .receipt-frame { min-height: 160px; max-height: 260px; } .receipt-frame iframe { height: 260px; } }
  `,
})
export class PaymentReviewModal implements OnInit, OnDestroy {
  private readonly paymentsService = inject(PaymentsService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly groupId = input.required<string>();
  readonly payment = input.required<PendingPayment>();
  /** Perfiles de la cuenta sin asignar (para el primer pago). */
  readonly freeProfiles = input<GroupProfile[]>([]);
  /** true = aprobado, false = rechazado. */
  readonly reviewed = output<boolean>();
  readonly closed = output<void>();

  protected readonly mode = signal<'review' | 'reject'>('review');
  protected readonly profileId = signal('');
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly receiptUrl = signal<string | null>(null);
  protected readonly receiptIsPdf = signal(false);
  protected readonly receiptError = signal<string | null>(null);
  protected readonly receiptSafeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.receiptUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  /** Primer pago: entra al grupo y hay que asignarle un perfil. Si no, es una renovación. */
  protected readonly isFirstPayment = computed(() => this.payment().membershipStatus === 'PENDING_PAYMENT');
  protected readonly firstName = computed(() => this.payment().member.name.trim().split(/\s+/)[0]);
  protected readonly kindLabel = computed(() => {
    const p = this.payment();
    if (this.isFirstPayment()) return 'Primer pago · entra al grupo';
    return p.membershipStatus === 'SUSPENDED' ? 'Renovación con el plazo vencido' : 'Renovación del siguiente periodo';
  });
  protected readonly amountDetail = computed(() => {
    const p = this.payment();
    if (p.includesNextCycle) return ` · ${p.proratedDays} días + ciclo siguiente`;
    return p.proratedDays ? ` · solo ${p.proratedDays} días` : '';
  });
  protected readonly dirty = computed(() => this.mode() === 'reject' && !!this.reason().trim());
  protected readonly canApprove = computed(
    () => !this.saving() && (!this.isFirstPayment() || (this.freeProfiles().length > 0 && !!this.profileId())),
  );

  ngOnInit(): void {
    this.paymentsService.getReceiptBlob(this.groupId(), this.payment().id).subscribe({
      next: (blob) => {
        this.receiptIsPdf.set(blob.type === 'application/pdf');
        this.receiptUrl.set(URL.createObjectURL(blob));
      },
      error: () => this.receiptError.set('No pudimos cargar el comprobante. Cierra y vuelve a intentarlo.'),
    });
  }

  ngOnDestroy(): void {
    const url = this.receiptUrl();
    if (url) URL.revokeObjectURL(url);
  }

  protected approve(): void {
    if (!this.canApprove()) return;
    this.send(true, undefined, this.isFirstPayment() ? this.profileId() : undefined);
  }

  protected reject(): void {
    if (this.saving()) return;
    this.send(false, this.reason().trim() || undefined);
  }

  private send(approve: boolean, reason?: string, profileId?: string): void {
    this.saving.set(true);
    this.error.set(null);
    this.paymentsService.review(this.groupId(), this.payment().id, approve, reason, profileId).subscribe({
      next: () => {
        this.saving.set(false);
        this.reviewed.emit(approve);
      },
      error: (message: string) => {
        this.saving.set(false);
        this.error.set(message);
      },
    });
  }

  /** Fechas de periodo: se guardan a medianoche UTC. */
  protected periodLabel(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
  }

  protected dateTimeLabel(iso: string): string {
    return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).replace(/\./g, '');
  }
}
