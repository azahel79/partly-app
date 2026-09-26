import { Component, OnInit, inject, signal } from '@angular/core';
import { WholesaleAccessService } from '../../shared/wholesale-access.service';
import { ConfirmService } from '../../shared/confirm.service';
import { AdminWholesaleAccessRow, WholesaleAccessStatus } from '../../shared/wholesale-access.models';

type Filter = WholesaleAccessStatus;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'REQUESTED', label: 'Solicitudes' },
  { value: 'AUTHORIZED', label: 'Autorizados' },
  { value: 'REJECTED', label: 'Rechazados' },
  { value: 'REVOKED', label: 'Retirados' },
];

const STATUS: Record<WholesaleAccessStatus, { label: string; tone: string }> = {
  REQUESTED: { label: 'Solicitó acceso', tone: 'bg-blue-100 text-blue-800' },
  AUTHORIZED: { label: 'Autorizado', tone: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { label: 'Rechazado', tone: 'bg-amber-100 text-amber-800' },
  REVOKED: { label: 'Acceso retirado', tone: 'bg-red-100 text-red-700' },
};

/** Quién puede comprar al mayoreo: el admin ve la reputación de cada vendedor y autoriza (con tope mensual) o rechaza. */
@Component({
  selector: 'app-wholesale-access-admin',
  styleUrl: './wholesale-access.css',
  templateUrl: './wholesale-access.html',
})
export class WholesaleAccessAdmin implements OnInit {
  private readonly accessService = inject(WholesaleAccessService);
  private readonly confirmService = inject(ConfirmService);

  protected readonly filters = FILTERS;
  protected readonly statusLabel = STATUS;
  protected readonly filter = signal<Filter>('REQUESTED');
  protected readonly search = signal('');
  protected readonly rows = signal<AdminWholesaleAccessRow[] | null>(null);
  protected readonly suggestedCap = signal(2);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly actingId = signal<string | null>(null);

  /** Vendedor al que se le está definiendo el tope antes de autorizarlo. */
  protected readonly authorizingId = signal<string | null>(null);
  protected readonly capInput = signal<number | null>(2);

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    this.load();
  }

  protected setFilter(value: Filter): void {
    this.search.set('');
    this.filter.set(value);
    this.load();
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 350);
  }

  private load(): void {
    this.rows.set(null);
    this.accessService.findAll(this.filter(), this.search()).subscribe({
      next: (page) => {
        this.rows.set(page.data);
        this.suggestedCap.set(page.suggestedCap);
      },
      error: (message: string) => {
        this.errorMessage.set(message);
        this.rows.set([]);
      },
    });
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  protected openAuthorize(row: AdminWholesaleAccessRow): void {
    this.authorizingId.set(row.user.id);
    this.capInput.set(row.monthlyCap ?? this.suggestedCap());
  }

  protected onCapInput(value: string): void {
    this.capInput.set(value === '' ? null : Number(value));
  }

  protected confirmAuthorize(row: AdminWholesaleAccessRow): void {
    const cap = this.capInput();
    this.apply(row, { status: 'AUTHORIZED', monthlyCap: cap && cap > 0 ? cap : undefined });
  }

  protected async reject(row: AdminWholesaleAccessRow): Promise<void> {
    const note = await this.confirmService.prompt({
      title: 'Rechazar solicitud',
      text: 'El vendedor verá el motivo para saber qué mejorar.',
      placeholder: 'Ej. Aún necesitas más reseñas de tus compradores.',
      confirmText: 'Rechazar',
      required: true,
    });
    if (note === null) return;
    this.apply(row, { status: 'REJECTED', note });
  }

  protected async revoke(row: AdminWholesaleAccessRow): Promise<void> {
    const note = await this.confirmService.prompt({
      title: `Retirar el acceso de ${row.user.name}`,
      text: 'Dejará de poder comprar al mayoreo. Sus cuentas ya entregadas no se tocan.',
      placeholder: 'Motivo (opcional)',
      confirmText: 'Retirar acceso',
    });
    if (note === null) return;
    this.apply(row, { status: 'REVOKED', note: note || undefined });
  }

  private apply(row: AdminWholesaleAccessRow, input: { status: 'AUTHORIZED' | 'REJECTED' | 'REVOKED'; monthlyCap?: number; note?: string }): void {
    if (this.actingId()) return;
    this.actingId.set(row.user.id);
    this.errorMessage.set(null);
    this.accessService.review(row.user.id, input).subscribe({
      next: () => {
        this.actingId.set(null);
        this.authorizingId.set(null);
        this.load();
      },
      error: (message: string) => {
        this.actingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }
}
