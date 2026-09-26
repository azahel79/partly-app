import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { GroupsService } from '../groups.service';
import { MembershipStatus } from '../memberships.models';

interface MyMembership {
  id: string;
  status: MembershipStatus;
  currentPeriodEnd: string;
  autoRenew: boolean;
}

/**
 * Interruptor "Renovación automática" del comprador. Apagarlo es para quien solo quiere probar: no se le cobra
 * el mes siguiente y, al terminar el periodo que ya pagó, su lugar queda libre. Se muestra solo si la persona
 * tiene un lugar vivo en el grupo, así que puede ponerse sin condiciones en cualquier pantalla del grupo.
 */
@Component({
  selector: 'app-renewal-toggle',
  template: `
    @if (membership(); as m) {
      <div class="rt-card flex items-start gap-3 p-4 rounded-2xl bg-white border border-slate-200/70">
        <span class="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center" [class]="m.autoRenew ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'">
          <span class="material-symbols-outlined text-xl">{{ m.autoRenew ? 'autorenew' : 'event_busy' }}</span>
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-extrabold text-ink">Renovación automática</p>
          <p class="text-xs text-on-surface-variant font-medium mt-0.5 leading-relaxed">
            @if (m.autoRenew) {
              @if (endLabel()) {
                Tu periodo termina el {{ endLabel() }}. Unos 3 días antes te generaremos el cobro de la renovación para que lo pagues antes de usar el mes siguiente. Si solo quieres probar el grupo, desactívala y no se te cobrará.
              } @else {
                Unos 3 días antes de que termine tu primer periodo te generaremos el cobro de la renovación. Si solo quieres probar el grupo, desactívala.
              }
            } @else {
              No se te cobrará el mes siguiente.
              @if (endLabel()) { Tendrás acceso hasta el {{ endLabel() }} y después tu lugar quedará libre para otra persona. } @else { Tu lugar quedará libre al terminar tu primer periodo. }
              Puedes volver a activarla antes de esa fecha.
            }
          </p>
          @if (errorMessage()) {
            <p class="text-[11px] text-red-600 font-semibold mt-1">{{ errorMessage() }}</p>
          }
        </div>
        <button
          type="button"
          role="switch"
          [attr.aria-checked]="m.autoRenew"
          [attr.aria-label]="m.autoRenew ? 'Desactivar la renovación automática' : 'Activar la renovación automática'"
          [disabled]="saving()"
          (click)="toggle()"
          class="rt-switch relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-60"
          [class]="m.autoRenew ? 'bg-emerald-500' : 'bg-slate-300'"
        >
          <span class="absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform" [style.transform]="m.autoRenew ? 'translateX(20px)' : 'translateX(0)'"></span>
        </button>
      </div>
    }
  `,
})
export class RenewalToggle implements OnInit {
  private readonly groupsService = inject(GroupsService);

  readonly groupId = input.required<string>();

  protected readonly membership = signal<MyMembership | null>(null);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly endLabel = computed(() => {
    const m = this.membership();
    // Antes de que el grupo inicie no hay periodo en curso: la fecha que trae es provisional.
    if (!m || m.status === 'RESERVED') return null;
    return new Date(m.currentPeriodEnd).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  });

  ngOnInit(): void {
    this.groupsService.findMyMembership(this.groupId()).subscribe({
      next: (membership) => this.membership.set(membership as MyMembership | null),
      error: () => this.membership.set(null),
    });
  }

  protected toggle(): void {
    const current = this.membership();
    if (!current || this.saving()) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    this.groupsService.setAutoRenew(this.groupId(), !current.autoRenew).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.membership.set({ ...current, autoRenew: updated.autoRenew });
      },
      error: (message: string) => {
        this.saving.set(false);
        this.errorMessage.set(message);
      },
    });
  }
}
