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
      <div class="rt-card flex items-center gap-4 px-5 py-4 sm:px-6 rounded-2xl bg-white shadow-neu-raised">
        <div class="min-w-0 flex-1">
          <p class="text-base font-bold text-ink">Renovación automática</p>
          <p class="text-[13px] text-on-surface-variant mt-1 leading-relaxed">
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
            <p class="text-xs text-red-600 font-semibold mt-1">{{ errorMessage() }}</p>
          }
        </div>
        <label class="shrink-0 flex items-center gap-2.5 text-[13px] font-semibold cursor-pointer" [class]="m.autoRenew ? 'text-emerald-700' : 'text-on-surface-variant'">
          <button
            type="button"
            role="switch"
            [attr.aria-checked]="m.autoRenew"
            [attr.aria-label]="m.autoRenew ? 'Desactivar la renovación automática' : 'Activar la renovación automática'"
            [disabled]="saving()"
            (click)="toggle()"
            class="rt-switch relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-60"
            [class]="m.autoRenew ? 'bg-[#047857]' : 'bg-slate-300'"
          >
            <span class="absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform" [style.transform]="m.autoRenew ? 'translateX(20px)' : 'translateX(0)'"></span>
          </button>
          <span class="hidden sm:inline">{{ m.autoRenew ? 'Encendida' : 'Apagada' }}</span>
        </label>
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
