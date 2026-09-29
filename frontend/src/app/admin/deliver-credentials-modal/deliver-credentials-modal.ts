import { Component, computed, inject, input, output, signal } from '@angular/core';
import { ProviderOrdersService } from '../../shared/provider-orders.service';
import { ProviderOrder } from '../../shared/provider-orders.models';
import { UiModal } from '../../shared/ui-modal/ui-modal';
import { MoneyPipe } from '../../shared/money';

/**
 * Entregar las credenciales de una compra de mayoreo ya pagada. Muestra qué se entrega y a quién (con el comprobante
 * a la mano) y, si es una reposición, avisa que reemplaza las credenciales del grupo del vendedor.
 */
@Component({
  selector: 'app-deliver-credentials-modal',
  imports: [UiModal, MoneyPipe],
  template: `
    <app-ui-modal #modal title="Entregar credenciales" [subtitle]="subtitle()" [dirty]="dirty()" [busy]="saving()" (closed)="closed.emit()">
      <dl class="ui-summary">
        <dt>Cuenta</dt>
        <dd>{{ order().listing.platform.name }} · {{ order().listing.tierName }}</dd>
        @if (order().buyer; as buyer) {
          <dt>Vendedor</dt>
          <dd>{{ buyer.name }}</dd>
        }
        <dt>Pagó</dt>
        <dd>{{ order().unitPrice | money }}{{ order().paidAt ? ' · validado el ' + formatDate(order().paidAt!) : '' }}</dd>
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
      </dl>

      @if (order().kind === 'REPLACEMENT') {
        <p class="ui-note ui-note--info">
          <span class="material-symbols-outlined">sync</span>
          <span>Es una <strong>reposición</strong>: estas credenciales sustituyen a la cuenta anterior. Si el vendedor ya la publicó como grupo, Partly actualiza la contraseña del grupo y avisa a sus miembros.</span>
        </p>
      }

      <label class="ui-field">
        <span>Usuario o correo de la cuenta</span>
        <input class="ui-input" type="text" autocomplete="off" [value]="username()" (input)="username.set($any($event.target).value)" placeholder="cuenta@ejemplo.com" />
      </label>
      <label class="ui-field">
        <span>Contraseña</span>
        <input class="ui-input" type="text" autocomplete="off" spellcheck="false" [value]="password()" (input)="password.set($any($event.target).value)" placeholder="La contraseña real de la cuenta" />
      </label>
      <label class="ui-field">
        <span>Instrucciones para el vendedor <small>(opcional)</small></span>
        <textarea class="ui-input" rows="3" [value]="notes()" (input)="notes.set($any($event.target).value)" placeholder="Ej. no cambies el correo de la cuenta; el perfil 5 es de respaldo."></textarea>
      </label>
      <p class="ui-field-hint">Se guardan cifradas. El vendedor las ve en Mayoreo → Mis compras.</p>

      @if (error()) {
        <p class="ui-note ui-note--danger"><span class="material-symbols-outlined">error</span><span>{{ error() }}</span></p>
      }

      <div modal-actions>
        <button type="button" class="ui-btn ui-btn--secondary" [disabled]="saving()" (click)="modal.close()">Cancelar</button>
        <button type="button" class="ui-btn ui-btn--primary" [disabled]="!canSubmit()" (click)="submit()">
          <span class="material-symbols-outlined">key</span>{{ saving() ? 'Entregando…' : 'Entregar credenciales' }}
        </button>
      </div>
    </app-ui-modal>
  `,
})
export class DeliverCredentialsModal {
  private readonly providerOrdersService = inject(ProviderOrdersService);

  readonly order = input.required<ProviderOrder>();
  readonly delivered = output<ProviderOrder>();
  readonly closed = output<void>();

  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly notes = signal('');
  protected readonly saving = signal(false);
  protected readonly openingReceipt = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly subtitle = computed(() =>
    this.order().kind === 'REPLACEMENT' ? 'Reposición de una cuenta que está por vencer' : 'Compra al mayoreo con el pago ya validado',
  );
  protected readonly dirty = computed(() => !!(this.username().trim() || this.password() || this.notes().trim()));
  protected readonly canSubmit = computed(() => !this.saving() && !!this.username().trim() && !!this.password());

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.providerOrdersService
      .deliver(this.order().id, { username: this.username().trim(), password: this.password(), notes: this.notes().trim() || undefined })
      .subscribe({
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
