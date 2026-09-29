import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { ProviderOrdersService } from '../../shared/provider-orders.service';
import { ProviderOrder } from '../../shared/provider-orders.models';
import { UiModal } from '../../shared/ui-modal/ui-modal';
import { MoneyPipe } from '../../shared/money';

type DeliveryKind = 'CREDENTIALS' | 'PANEL';

/**
 * Entregar (o actualizar) el acceso de una compra de mayoreo. Se entrega con credenciales (correo y contraseña) o por
 * panel (el link donde el vendedor da de alta a sus usuarios, con usuario y contraseña del panel si los pide). Al
 * actualizar una cuenta ya entregada se avisa al vendedor, a su grupo si ya la publicó y en su reporte si tiene uno.
 */
@Component({
  selector: 'app-deliver-credentials-modal',
  imports: [UiModal, MoneyPipe],
  template: `
    <app-ui-modal #modal [title]="isUpdate() ? 'Actualizar credenciales' : 'Entregar credenciales'" [subtitle]="subtitle()" [dirty]="dirty()" [busy]="saving()" (closed)="closed.emit()">
      <dl class="ui-summary">
        <dt>Cuenta</dt>
        <dd>{{ order().listing.platform.name }} · {{ order().listing.tierName }}</dd>
        @if (order().buyer; as buyer) {
          <dt>Vendedor</dt>
          <dd>{{ buyer.name }}</dd>
        }
        <dt>Pagó</dt>
        <dd>{{ order().unitPrice | money }}{{ order().paidAt ? ' · validado el ' + formatDate(order().paidAt!) : '' }}</dd>
        @if (!isUpdate()) {
          <dt>Comprobante</dt>
          <dd>
            @if (order().hasReceipt) {
              <button type="button" class="ui-link" [disabled]="openingReceipt()" (click)="viewReceipt()">
                <span class="material-symbols-outlined">receipt_long</span>{{ openingReceipt() ? 'Abriendo…' : 'Ver comprobante' }}
              </button>
            } @else {
              Sin comprobante
            }
          </dd>
        }
      </dl>

      @if (isUpdate()) {
        <p class="ui-note ui-note--info">
          <span class="material-symbols-outlined">campaign</span>
          <span>Le avisamos al vendedor{{ order().resultingGroupId ? ', cambiamos también la contraseña de su grupo y les avisamos a sus miembros' : '' }}. Si tiene un reporte abierto de esta cuenta, le dejamos la respuesta ahí para que confirme que ya quedó.</span>
        </p>
      } @else if (order().kind === 'REPLACEMENT') {
        <p class="ui-note ui-note--info">
          <span class="material-symbols-outlined">sync</span>
          <span>Es una <strong>reposición</strong>: estas credenciales sustituyen a la cuenta anterior. Si el vendedor ya la publicó como grupo, Partly actualiza la contraseña del grupo y avisa a sus miembros.</span>
        </p>
      }

      <div class="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Cómo se entrega">
        <span class="text-xs font-semibold text-on-surface-variant mr-1">Se entrega con:</span>
        <button type="button" class="ui-chip" [class.is-active]="kind() === 'CREDENTIALS'" (click)="kind.set('CREDENTIALS')"><span class="material-symbols-outlined">key</span>Correo y contraseña</button>
        <button type="button" class="ui-chip" [class.is-active]="kind() === 'PANEL'" (click)="kind.set('PANEL')"><span class="material-symbols-outlined">dashboard</span>Panel (link)</button>
      </div>

      @if (loadingCurrent()) {
        <div class="ui-skeleton-card"><span class="ui-skeleton w-2/3"></span><span class="ui-skeleton"></span></div>
      } @else {
        @if (kind() === 'PANEL') {
          <label class="ui-field">
            <span>Link del panel</span>
            <input class="ui-input" type="url" autocomplete="off" [value]="panelUrl()" (input)="panelUrl.set($any($event.target).value)" placeholder="https://panel.proveedor.com/…" />
          </label>
          <p class="ui-field-hint">Ahí el vendedor da de alta a sus usuarios. Si el panel pide usuario y contraseña, ponlos abajo.</p>
        }
        <label class="ui-field">
          <span>{{ kind() === 'PANEL' ? 'Usuario del panel' : 'Usuario o correo de la cuenta' }} @if (kind() === 'PANEL') { <small>(opcional)</small> }</span>
          <input class="ui-input" type="text" autocomplete="off" [value]="username()" (input)="username.set($any($event.target).value)" placeholder="cuenta@ejemplo.com" />
        </label>
        <label class="ui-field">
          <span>{{ kind() === 'PANEL' ? 'Contraseña del panel' : 'Contraseña' }} @if (kind() === 'PANEL') { <small>(opcional)</small> }</span>
          <input class="ui-input" type="text" autocomplete="off" spellcheck="false" [value]="password()" (input)="password.set($any($event.target).value)" placeholder="La contraseña real" />
        </label>
        <label class="ui-field">
          <span>Instrucciones para el vendedor <small>(opcional)</small></span>
          <textarea class="ui-input" rows="3" [value]="notes()" (input)="notes.set($any($event.target).value)" placeholder="Ej. no cambies el correo de la cuenta; el perfil 5 es de respaldo."></textarea>
        </label>
        @if (isUpdate()) {
          <label class="ui-field">
            <span>Motivo del cambio <small>(opcional, lo ven el vendedor y sus miembros)</small></span>
            <input class="ui-input" type="text" maxlength="200" [value]="reason()" (input)="reason.set($any($event.target).value)" placeholder="Ej. Cambiamos la contraseña por seguridad" />
          </label>
        }
        <p class="ui-field-hint">Se guardan cifradas. El vendedor las ve en Mayoreo → Mis compras.</p>
      }

      @if (error()) {
        <p class="ui-note ui-note--danger"><span class="material-symbols-outlined">error</span><span>{{ error() }}</span></p>
      }

      <div modal-actions>
        <button type="button" class="ui-btn ui-btn--secondary" [disabled]="saving()" (click)="modal.close()">Cancelar</button>
        <button type="button" class="ui-btn ui-btn--primary" [disabled]="!canSubmit()" (click)="submit()">
          <span class="material-symbols-outlined">{{ kind() === 'PANEL' ? 'dashboard' : 'key' }}</span>{{ saving() ? 'Guardando…' : (isUpdate() ? 'Guardar y avisar' : 'Entregar') }}
        </button>
      </div>
    </app-ui-modal>
  `,
})
export class DeliverCredentialsModal implements OnInit {
  private readonly providerOrdersService = inject(ProviderOrdersService);

  readonly order = input.required<ProviderOrder>();
  /** 'update' = la cuenta ya se entregó y Partly corrige o cambia sus credenciales. */
  readonly mode = input<'deliver' | 'update'>('deliver');
  readonly delivered = output<ProviderOrder>();
  readonly closed = output<void>();

  protected readonly kind = signal<DeliveryKind>('CREDENTIALS');
  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly panelUrl = signal('');
  protected readonly notes = signal('');
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly loadingCurrent = signal(false);
  protected readonly openingReceipt = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Lo que ya estaba guardado (al actualizar), para saber si se escribió algo nuevo. */
  private readonly initial = signal('');

  protected readonly isUpdate = computed(() => this.mode() === 'update');
  protected readonly subtitle = computed(() =>
    this.isUpdate() ? 'Cuenta ya entregada: corrige o cambia su acceso' : this.order().kind === 'REPLACEMENT' ? 'Reposición de una cuenta que está por vencer' : 'Compra al mayoreo con el pago ya validado',
  );
  private readonly snapshot = computed(() => [this.kind(), this.username(), this.password(), this.panelUrl(), this.notes(), this.reason()].join('|'));
  protected readonly dirty = computed(() => this.snapshot() !== this.initial());
  protected readonly canSubmit = computed(() => {
    if (this.saving() || this.loadingCurrent()) return false;
    if (this.kind() === 'PANEL') return /^https?:\/\/\S+\.\S+/.test(this.panelUrl().trim());
    return !!this.username().trim() && !!this.password() && (!this.isUpdate() || this.dirty());
  });

  ngOnInit(): void {
    this.initial.set(this.snapshot());
    if (!this.isUpdate()) return;
    // Al actualizar se parte de lo que ya tiene la cuenta.
    this.loadingCurrent.set(true);
    this.providerOrdersService.getCredential(this.order().id).subscribe({
      next: (cred) => {
        this.kind.set(cred.panelUrl ? 'PANEL' : 'CREDENTIALS');
        this.username.set(cred.username ?? '');
        this.password.set(cred.password ?? '');
        this.panelUrl.set(cred.panelUrl ?? '');
        this.notes.set(cred.notes ?? '');
        this.initial.set(this.snapshot());
        this.loadingCurrent.set(false);
      },
      error: (message: string) => {
        this.loadingCurrent.set(false);
        this.error.set(message);
      },
    });
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    const byPanel = this.kind() === 'PANEL';
    const input = {
      username: this.username().trim() || undefined,
      password: this.password() || undefined,
      panelUrl: byPanel ? this.panelUrl().trim() : undefined,
      notes: this.notes().trim() || undefined,
      ...(this.isUpdate() ? { changeReason: this.reason().trim() || undefined } : {}),
    };
    this.saving.set(true);
    this.error.set(null);
    const request = this.isUpdate() ? this.providerOrdersService.updateCredential(this.order().id, input) : this.providerOrdersService.deliver(this.order().id, input);
    request.subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.delivered.emit(updated);
      },
      error: (message: string) => {
        this.saving.set(false);
        this.error.set(message);
      },
    });
  }

  protected viewReceipt(): void {
    if (this.openingReceipt()) {
      return;
    }
    this.openingReceipt.set(true);
    this.providerOrdersService.getReceiptBlob(this.order().id).subscribe({
      next: (blob) => {
        this.openingReceipt.set(false);
        window.open(URL.createObjectURL(blob), '_blank');
      },
      error: (message: string) => {
        this.openingReceipt.set(false);
        this.error.set(message);
      },
    });
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  }
}
