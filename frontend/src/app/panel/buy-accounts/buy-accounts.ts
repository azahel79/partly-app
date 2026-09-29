import { NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ProviderListingsService } from '../../shared/provider-listings.service';
import { ProviderOrdersService } from '../../shared/provider-orders.service';
import { WholesaleAccessService } from '../../shared/wholesale-access.service';
import { ProviderListing } from '../../shared/provider-listings.models';
import { ProviderOrder, ProviderOrderCredential } from '../../shared/provider-orders.models';
import { MyWholesaleAccess } from '../../shared/wholesale-access.models';
import { ConfirmService } from '../../shared/confirm.service';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';
import { AuthService } from '../../shared/auth.service';
import { MoneyPipe } from '../../shared/money';

const EXPIRY_SOON_DAYS = 7;
/** Compras que todavía esperan algo (tu pago, la validación o la entrega). */
const OPEN_STATUSES = new Set<ProviderOrder['status']>(['AWAITING_PAYMENT', 'PENDING_APPROVAL', 'PENDING_DELIVERY']);

export interface ExpiryInfo {
  daysLeft: number;
  state: 'ok' | 'soon' | 'expired';
}

@Component({
  imports: [RouterLink, PlatformLogo, MoneyPipe, NgTemplateOutlet],
  selector: 'app-buy-accounts',
  styleUrl: './buy-accounts.css',
  templateUrl: './buy-accounts.html',
})
export class BuyAccounts implements OnInit, OnDestroy {
  private readonly confirmService = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly providerListingsService = inject(ProviderListingsService);
  private readonly providerOrdersService = inject(ProviderOrdersService);
  private readonly wholesaleAccessService = inject(WholesaleAccessService);
  /** El administrador es quien maneja la tienda de mayoreo: no aplica la reputación ni la compra. */
  protected readonly isAdmin = inject(AuthService).isAdmin;


  protected readonly access = signal<MyWholesaleAccess | null>(null);
  protected readonly requestingAccess = signal(false);
  protected readonly listings = signal<ProviderListing[] | null>(null);
  protected readonly myOrders = signal<ProviderOrder[] | null>(null);

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly cancellingId = signal<string | null>(null);
  protected readonly followingUpId = signal<string | null>(null);

  /** Porcentaje de requisitos cumplidos, para la barra de la pantalla bloqueada. */
  protected readonly progressPct = computed(() => {
    const a = this.access();
    return a && a.total > 0 ? Math.round((a.metCount / a.total) * 100) : 0;
  });

  /** Listings con una compra tuya todavía en curso (esperando pago, validación o entrega). */
  protected readonly pendingListingIds = computed(() => {
    const ids = new Set<string>();
    for (const order of this.myOrders() ?? []) {
      if (order.kind === 'PURCHASE' && (order.status === 'AWAITING_PAYMENT' || order.status === 'PENDING_APPROVAL' || order.status === 'PENDING_DELIVERY')) {
        ids.add(order.listing.id);
      }
    }
    return ids;
  });

  /**
   * "Mis compras" por cuenta y no por pago: una renovación o reposición en curso se muestra dentro de la tarjeta de su
   * cuenta, no como otra fila. Lo demás se reparte en compras en proceso, cuentas activas, vencidas e historial.
   */
  protected readonly orderSections = computed(() => {
    const all = this.myOrders() ?? [];
    const nestedIds = new Set(all.map((o) => o.openFollowUp?.id).filter((id): id is string => !!id));
    const inProgress: ProviderOrder[] = [];
    const active: ProviderOrder[] = [];
    const expired: ProviderOrder[] = [];
    const history: ProviderOrder[] = [];
    for (const order of all) {
      if (nestedIds.has(order.id)) continue;
      if (OPEN_STATUSES.has(order.status)) {
        inProgress.push(order);
      } else if (order.status === 'FULFILLED' && order.kind !== 'RENEWAL' && !order.replaced) {
        (this.expiry(order)?.state === 'expired' ? expired : active).push(order);
      } else {
        history.push(order);
      }
    }
    return { inProgress, active, expired, history };
  });

  /** La renovación o reposición en curso de una cuenta (la orden completa, para mostrar su monto y estado). */
  protected followUpOf(order: ProviderOrder): ProviderOrder | null {
    const id = order.openFollowUp?.id;
    return id ? ((this.myOrders() ?? []).find((o) => o.id === id) ?? null) : null;
  }

  protected followUpStatus(order: ProviderOrder): string {
    switch (order.status) {
      case 'AWAITING_PAYMENT':
        return order.paymentDueAt ? `Falta tu pago · tienes hasta el ${this.formatDateTime(order.paymentDueAt)}` : 'Falta tu pago';
      case 'PENDING_APPROVAL':
        return 'Validando tu pago';
      case 'PENDING_DELIVERY':
        return order.kind === 'REPLACEMENT' ? 'Pago validado · esperando las credenciales de la cuenta nueva' : 'Pago validado';
      default:
        return '';
    }
  }

  protected readonly capReached = computed(() => {
    const a = this.access();
    return !!a && a.monthlyCap !== null && a.usedThisMonth >= a.monthlyCap;
  });

  protected readonly openCredentialOrderId = signal<string | null>(null);
  protected readonly credentialByOrderId = signal<Record<string, ProviderOrderCredential>>({});
  protected readonly loadingCredentialId = signal<string | null>(null);
  protected readonly showPasswordOrderId = signal<string | null>(null);
  protected readonly copiedField = signal<'username' | 'password' | null>(null);

  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private readonly refreshOnFocus = () => this.refresh();

  ngOnInit(): void {
    if (this.isAdmin()) {
      return;
    }
    this.refresh();
    // Lo que el proveedor publica o decide mientras tienes esta pantalla abierta debe verse sin recargar.
    this.pollHandle = setInterval(() => this.refresh(), 15_000);
    window.addEventListener('focus', this.refreshOnFocus);
  }

  ngOnDestroy(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
    }
    window.removeEventListener('focus', this.refreshOnFocus);
  }

  private refresh(): void {
    this.wholesaleAccessService.getMine().subscribe({
      next: (access) => {
        this.access.set(access);
        // El catálogo solo se carga con acceso autorizado.
        if (access.authorized) this.loadListings();
      },
      error: (message: string) => this.errorMessage.set(message),
    });
    this.loadMyOrders();
  }

  private loadListings(): void {
    this.providerListingsService.findAvailable(1, 50).subscribe({
      next: (page) => this.listings.set(page.data),
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  private loadMyOrders(): void {
    this.providerOrdersService.findMine().subscribe({
      next: (page) => this.myOrders.set(page.data),
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  protected requestAccess(): void {
    if (this.requestingAccess()) return;
    this.requestingAccess.set(true);
    this.errorMessage.set(null);
    this.wholesaleAccessService.request().subscribe({
      next: (access) => {
        this.requestingAccess.set(false);
        this.access.set(access);
      },
      error: (message: string) => {
        this.requestingAccess.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  /** Vence, o falta poco: para pintar el aviso y ofrecer renovar / reponer. */
  protected expiry(order: ProviderOrder): ExpiryInfo | null {
    if (!order.expiresAt || order.status !== 'FULFILLED' || order.kind === 'RENEWAL' || order.replaced) return null;
    const daysLeft = Math.ceil((new Date(order.expiresAt).getTime() - Date.now()) / 86_400_000);
    return { daysLeft, state: daysLeft <= 0 ? 'expired' : daysLeft <= EXPIRY_SOON_DAYS ? 'soon' : 'ok' };
  }

  protected kindLabel(order: ProviderOrder): string | null {
    return order.kind === 'RENEWAL' ? 'Renovación' : order.kind === 'REPLACEMENT' ? 'Reposición' : null;
  }

  protected async cancelOrder(order: ProviderOrder): Promise<void> {
    if (this.cancellingId()) {
      return;
    }
    const ok = await this.confirmService.ask({
      title: '¿Retirar la reserva?',
      text: 'No pierdes nada: todavía no se validó ningún pago y la cuenta vuelve al inventario.',
      confirmText: 'Sí, retirar',
      cancelText: 'Volver',
      danger: true,
    });
    if (!ok) {
      return;
    }
    this.cancellingId.set(order.id);
    this.providerOrdersService.cancel(order.id).subscribe({
      next: (updated) => {
        this.cancellingId.set(null);
        this.myOrders.update((list) => (list ?? []).map((o) => (o.id === updated.id ? updated : o)));
        this.refresh();
      },
      error: (message: string) => {
        this.cancellingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  /** Renovar (cuenta renovable) o comprar la reposición (no renovable): ambos siguen el mismo flujo de pago. */
  protected followUp(order: ProviderOrder): void {
    if (this.followingUpId()) return;
    this.followingUpId.set(order.id);
    this.errorMessage.set(null);
    const request = order.renewable ? this.providerOrdersService.renew(order.id) : this.providerOrdersService.replace(order.id);
    request.subscribe({
      next: (created) => {
        this.followingUpId.set(null);
        this.router.navigate(['/panel/mayoreo/compras', created.id]);
      },
      error: (message: string) => {
        this.followingUpId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  protected toggleCredential(order: ProviderOrder): void {
    if (this.openCredentialOrderId() === order.id) {
      this.openCredentialOrderId.set(null);
      return;
    }
    this.openCredentialOrderId.set(order.id);
    if (this.credentialByOrderId()[order.id]) {
      return;
    }
    this.loadingCredentialId.set(order.id);
    this.providerOrdersService.getCredential(order.id).subscribe({
      next: (cred) => {
        this.loadingCredentialId.set(null);
        this.credentialByOrderId.update((map) => ({ ...map, [order.id]: cred }));
      },
      error: (message: string) => {
        this.loadingCredentialId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  protected togglePasswordVisibility(orderId: string): void {
    this.showPasswordOrderId.update((current) => (current === orderId ? null : orderId));
  }

  protected copyToClipboard(text: string, field: 'username' | 'password'): void {
    navigator.clipboard?.writeText(text).then(() => {
      this.copiedField.set(field);
      setTimeout(() => this.copiedField.set(null), 1500);
    });
  }

  protected billingPeriodLabel(period: string): string {
    return period === 'MONTHLY' ? 'mensual' : period === 'QUARTERLY' ? 'trimestral' : period === 'SEMIANNUAL' ? 'semestral' : 'anual';
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  private formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).replace(/\./g, '');
  }
}
