import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommissionsService } from '../../shared/commissions.service';
import { EarningEntry, EarningStatus, EarningsSummary } from '../../shared/commissions.models';

const STATUS_LABEL: Record<EarningStatus, { label: string; tone: string }> = {
  ACCRUED: { label: 'Comisión por generar cobro', tone: 'bg-slate-100 text-slate-600' },
  BILLED: { label: 'Comisión por pagar', tone: 'bg-amber-50 text-amber-700' },
  SETTLED: { label: 'Comisión pagada', tone: 'bg-emerald-50 text-emerald-700' },
};

const PAGE_SIZE = 10;

/**
 * Lo que el vendedor gana: el dinero de sus compradores ya llega directo a su cuenta, así que
 * aquí solo se lleva la cuenta (cobrado, comisión de Vakeva y lo que le queda). Nada se retira.
 */
@Component({
  imports: [RouterLink],
  selector: 'app-earnings',
  styleUrl: './earnings.css',
  templateUrl: './earnings.html',
})
export class EarningsPage implements OnInit {
  private readonly commissionsService = inject(CommissionsService);

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly summary = signal<EarningsSummary | null>(null);
  protected readonly entries = signal<EarningEntry[] | null>(null);
  protected readonly totalEntries = signal(0);
  protected readonly loadingMore = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  private page = 1;

  private readonly money$ = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

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
    return this.money$.format(value);
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
