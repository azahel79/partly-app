import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { CommissionsService } from '../../shared/commissions.service';

/**
 * Aviso del panel para el vendedor que debe comisión a Partly (o la tiene en revisión). No
 * aparece si no debe nada, así que a quien solo compra nunca se le muestra.
 */
@Component({
  imports: [RouterLink],
  selector: 'app-commission-notice',
  template: `
    @if (status(); as s) {
      @if (onCommissionsPage()) {
        <!-- la propia pantalla de Comisiones ya lo explica -->
      } @else if (s.restricted) {
        <div class="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-900" role="alert">
          <span class="material-symbols-outlined">block</span>
          <p class="flex-1 min-w-[220px] text-sm"><strong>Tu comisión de {{ money(s.toPay) }} está vencida.</strong> Tus grupos no reciben miembros nuevos hasta que la pagues.</p>
          <a routerLink="/panel/comisiones" class="py-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors">Pagar ahora</a>
        </div>
      } @else if (s.toPay > 0) {
        <div class="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
          <span class="material-symbols-outlined">request_quote</span>
          <p class="flex-1 min-w-[220px] text-sm"><strong>Tienes {{ money(s.toPay) }} de comisión por pagar</strong>@if (s.payBy) { antes del {{ dateLabel(s.payBy) }}}.</p>
          <a routerLink="/panel/comisiones" class="py-2 px-4 rounded-lg bg-pink hover:bg-[#047857] text-white text-xs font-bold transition-colors">Pagar comisión</a>
        </div>
      } @else if (s.inReview > 0) {
        <div class="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100 text-blue-900">
          <span class="material-symbols-outlined">hourglass_top</span>
          <p class="flex-1 text-sm">Estamos revisando tu comprobante de comisión. Te avisamos cuando quede validado.</p>
          <a routerLink="/panel/comisiones" class="text-xs font-bold text-blue-800 hover:underline">Ver detalle</a>
        </div>
      }
    }
  `,
})
export class CommissionNotice {
  private readonly commissionsService = inject(CommissionsService);
  private readonly router = inject(Router);

  protected readonly onCommissionsPage = signal(this.router.url.startsWith('/panel/comisiones'));
  protected readonly status = computed(() => this.commissionsService.status());

  private readonly money$ = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.onCommissionsPage.set(event.urlAfterRedirects.startsWith('/panel/comisiones')));
  }

  protected money(value: number): string {
    return this.money$.format(value);
  }

  protected dateLabel(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
  }
}
