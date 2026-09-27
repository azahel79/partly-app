import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { CommissionsService } from '../../shared/commissions.service';
import { formatMoney } from '../../shared/money';

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
        <div class="cn-strip cn-danger" role="alert">
          <div class="cn-inner">
            <span><strong>Tu comisión de {{ money(s.toPay) }} está vencida.</strong> Tus grupos no reciben miembros nuevos hasta que la pagues.</span>
            <a routerLink="/panel/comisiones">Pagar ahora →</a>
          </div>
        </div>
      } @else if (s.toPay > 0) {
        <div class="cn-strip cn-warn">
          <div class="cn-inner">
            <span><strong>Comisión por pagar: {{ money(s.toPay) }}</strong>@if (s.payBy) { · vence el {{ dateLabel(s.payBy) }} ({{ daysLeftLabel(s.payBy) }})}</span>
            <a routerLink="/panel/comisiones">Pagar comisión →</a>
          </div>
        </div>
      } @else if (s.inReview > 0) {
        <div class="cn-strip cn-info">
          <div class="cn-inner">
            <span>Estamos revisando tu comprobante de comisión. Te avisamos cuando quede validado.</span>
            <a routerLink="/panel/comisiones">Ver detalle →</a>
          </div>
        </div>
      }
    }
  `,
  styles: `
    :host { display: block; }
    .cn-strip { border-bottom: 1px solid; font-size: 13px; }
    .cn-inner { max-width: 72rem; min-height: 40px; margin: 0 auto; padding: 8px 24px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 16px; }
    .cn-inner a { font-weight: 700; text-decoration: none; white-space: nowrap; }
    .cn-inner a:hover { text-decoration: underline; text-underline-offset: 3px; }
    .cn-warn { background: #fffaeb; border-color: #fedf89; color: #93370d; }
    .cn-warn strong { color: #7a2e0e; }
    .cn-warn a { color: #b54708; }
    .cn-danger { background: #fef3f2; border-color: #fecdca; color: #912018; }
    .cn-danger strong { color: #7a271a; }
    .cn-danger a { color: #b42318; }
    .cn-info { background: #eff8ff; border-color: #b2ddff; color: #194185; }
    .cn-info a { color: #175cd3; }
    @media (max-width: 639px) { .cn-inner { padding-inline: 16px; } }
    :host-context(html.dark) .cn-warn { background: rgba(251, 191, 36, 0.1); border-color: rgba(251, 191, 36, 0.25); color: #fde68a; }
    :host-context(html.dark) .cn-warn strong, :host-context(html.dark) .cn-warn a { color: #fcd34d; }
    :host-context(html.dark) .cn-danger { background: rgba(248, 113, 113, 0.1); border-color: rgba(248, 113, 113, 0.28); color: #fecaca; }
    :host-context(html.dark) .cn-danger strong, :host-context(html.dark) .cn-danger a { color: #fca5a5; }
    :host-context(html.dark) .cn-info { background: rgba(96, 165, 250, 0.1); border-color: rgba(96, 165, 250, 0.25); color: #bfdbfe; }
    :host-context(html.dark) .cn-info a { color: #93c5fd; }
  `,
})
export class CommissionNotice {
  private readonly commissionsService = inject(CommissionsService);
  private readonly router = inject(Router);

  protected readonly onCommissionsPage = signal(this.router.url.startsWith('/panel/comisiones'));
  protected readonly status = computed(() => this.commissionsService.status());

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.onCommissionsPage.set(event.urlAfterRedirects.startsWith('/panel/comisiones')));
  }

  protected money(value: number): string {
    return formatMoney(value);
  }

  protected dateLabel(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  protected daysLeftLabel(iso: string): string {
    const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
    if (days < 0) return 'ya venció';
    if (days === 0) return 'hoy';
    return days === 1 ? 'mañana' : `en ${days} días`;
  }
}
