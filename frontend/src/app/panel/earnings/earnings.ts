import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommissionsService } from '../../shared/commissions.service';
import { EarningEntry, EarningStatus, EarningsSummary } from '../../shared/commissions.models';
import { formatMoney } from '../../shared/money';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';

const STATUS_LABEL: Record<EarningStatus, { label: string; tone: string }> = {
  ACCRUED: { label: 'Comisión por generar cobro', tone: '' },
  BILLED: { label: 'Comisión por pagar', tone: 'ui-pill--warn' },
  SETTLED: { label: 'Comisión pagada', tone: 'ui-pill--ok' },
};

const PAGE_SIZE = 10;

/**
 * Lo que el vendedor gana: el dinero de sus compradores ya llega directo a su cuenta, así que
 * aquí solo se lleva la cuenta (cobrado, comisión de Tequio y lo que le queda). Nada se retira.
 */
@Component({
  imports: [RouterLink, PlatformLogo],
  selector: 'app-earnings',
  styleUrl: './earnings.css',
  templateUrl: './earnings.html',
})
export class EarningsPage implements OnInit {
  private readonly commissionsService = inject(CommissionsService);

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly summary = signal<EarningsSummary | null>(null);
  /** Fila de total de "Ganancia por grupo". */
  protected readonly totals = computed(() => {
    const groups = this.summary()?.byGroup ?? [];
    if (groups.length < 2) return null;
    return groups.reduce(
      (acc, g) => ({
        gross: acc.gross + g.gross,
        commission: acc.commission + g.commission,
        net: acc.net + g.net,
        cost: acc.cost + g.accountCost * g.cyclesBilled,
        profit: acc.profit + g.profit,
      }),
      { gross: 0, commission: 0, net: 0, cost: 0, profit: 0 },
    );
  });
  protected readonly entries = signal<EarningEntry[] | null>(null);
  protected readonly totalEntries = signal(0);
  protected readonly loadingMore = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  private page = 1;

  ngOnInit(): void {
    this.commissionsService.getEarningsSummary().subscribe({
      next: (summary) => this.summary.set(summary),
      error: (message: string) => this.errorMessage.set(message),
    });
    this.commissionsService.getEarningEntries(1, PAGE_SIZE).subscribe({
      next: (page) => {
        this.entries.set(page.data);
        this.totalEntries.set(page.total);
      },
      error: () => this.entries.set([]),
    });
  }

  protected hasMore(): boolean {
    return (this.entries()?.length ?? 0) < this.totalEntries();
  }

  protected loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    this.page += 1;
    this.commissionsService.getEarningEntries(this.page, PAGE_SIZE).subscribe({
      next: (page) => {
        this.entries.update((list) => [...(list ?? []), ...page.data]);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  protected money(value: number): string {
    return formatMoney(value);
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
