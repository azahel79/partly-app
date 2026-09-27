import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ProviderProfilesService } from '../../shared/provider-profiles.service';
import { ProviderListingsService } from '../../shared/provider-listings.service';
import { ProviderListing } from '../../shared/provider-listings.models';
import { ProviderOrdersService } from '../../shared/provider-orders.service';
import { ProviderOrder } from '../../shared/provider-orders.models';
import { ConfirmService } from '../../shared/confirm.service';
import { planFeatures } from '../../shared/plan-features.util';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';
import { MoneyPipe } from '../../shared/money';

/** Sugerencias rápidas para el datalist — las plataformas que más se compran al por mayor. No limita al admin a solo estas: puede escribir cualquier nombre. */
export const COMMON_PLATFORM_NAMES = [
  'Netflix', 'Disney+', 'Max', 'Paramount+', 'Spotify', 'YouTube Premium', 'Crunchyroll', 'Canva', 'Notion', 'ChatGPT Plus',
];

@Component({
  imports: [RouterLink, PlatformLogo, MoneyPipe],
  selector: 'app-provider-store',
  styleUrl: './provider-store.css',
  templateUrl: './provider-store.html',
})
export class ProviderStore implements OnInit {
  private readonly providerProfilesService = inject(ProviderProfilesService);
  private readonly providerListingsService = inject(ProviderListingsService);
  private readonly providerOrdersService = inject(ProviderOrdersService);
  private readonly router = inject(Router);
  private readonly confirmService = inject(ConfirmService);

  protected readonly planFeatures = planFeatures;
  protected readonly commonPlatformNames = COMMON_PLATFORM_NAMES;

  protected readonly ready = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly listings = signal<ProviderListing[] | null>(null);

  protected readonly formOpen = signal(false);
  protected readonly platformNameInput = signal('');
  protected readonly tierNameInput = signal('');
  protected readonly maxSlotsInput = signal<number | null>(null);
  protected readonly officialPriceInput = signal<number | null>(null);
  protected readonly wholesalePriceInput = signal<number | null>(null);
  protected readonly stockQuantityInput = signal<number | null>(null);
  protected readonly renewableInput = signal(true);
  protected readonly validityDaysInput = signal<number | null>(30);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly publishedNotice = signal<string | null>(null);

  /** Ahorro del vendedor frente al precio oficial — siempre sobre la cuenta completa, nunca por perfil. */
  protected readonly discountPreview = computed(() => {
    const official = this.officialPriceInput();
    const wholesale = this.wholesalePriceInput();
    if (!official || !wholesale || wholesale >= official) {
      return null;
    }
    return { pct: Math.round((1 - wholesale / official) * 100), saving: official - wholesale };
  });

  protected readonly missingFields = computed(() => {
    const missing: string[] = [];
    if (this.platformNameInput().trim().length < 2) missing.push('plataforma');
    if (!this.maxSlotsInput() || this.maxSlotsInput()! < 1) missing.push('perfiles');
    if (!this.officialPriceInput()) missing.push('precio oficial');
    if (!this.wholesalePriceInput()) missing.push('precio al por mayor');
    if (this.stockQuantityInput() === null || this.stockQuantityInput()! < 0) missing.push('cuentas disponibles');
    if (!this.validityDaysInput() || this.validityDaysInput()! < 1) missing.push('días de vigencia');
    return missing;
  });

  protected readonly updatingId = signal<string | null>(null);

  // filtros de la vista
  protected readonly listingSearch = signal('');
  protected readonly listingFilter = signal<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  protected readonly orderFilter = signal<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  protected readonly menuId = signal<string | null>(null);
  protected readonly viewingReceiptId = signal<string | null>(null);
  protected readonly brokenLogos = signal<Set<string>>(new Set());

  protected readonly filteredListings = computed(() => {
    const term = this.listingSearch().trim().toLowerCase();
    const filter = this.listingFilter();
    return (this.listings() ?? []).filter((l) => {
      if (filter === 'ACTIVE' && !l.active) return false;
      if (filter === 'PAUSED' && l.active) return false;
      return !term || `${l.plan.platform.name} ${l.plan.tierName}`.toLowerCase().includes(term);
    });
  });

  protected readonly orderCounts = computed(() => {
    const counts = { ALL: 0, PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const order of this.orders() ?? []) {
      counts.ALL += 1;
      counts[this.orderGroup(order)] += 1;
    }
    return counts;
  });

  protected readonly orderFilters: Array<{ k: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'; label: string; dot: string }> = [
    { k: 'ALL', label: 'Todos', dot: '' },
    { k: 'PENDING', label: 'Pendientes', dot: 'bg-amber-400' },
    { k: 'APPROVED', label: 'Aprobados', dot: 'bg-emerald-500' },
    { k: 'REJECTED', label: 'Rechazados', dot: 'bg-red-500' },
  ];

  protected readonly filteredOrders = computed(() => {
    const filter = this.orderFilter();
    return (this.orders() ?? []).filter((o) => filter === 'ALL' || this.orderGroup(o) === filter);
  });

  protected readonly orders = signal<ProviderOrder[] | null>(null);
  protected readonly decidingOrderId = signal<string | null>(null);
  protected readonly deciderError = signal<string | null>(null);
  protected readonly deciderErrorOrderId = signal<string | null>(null);

  protected readonly deliveringOrderId = signal<string | null>(null);
  protected readonly deliverUsername = signal('');
  protected readonly deliverPassword = signal('');
  protected readonly deliverNotes = signal('');
  protected readonly savingDelivery = signal(false);
  protected readonly deliverError = signal<string | null>(null);

  ngOnInit(): void {
    // Cualquiera que llegue aquí ya pasó el adminGuard de la ruta — activar el perfil de
    // proveedor la primera vez es un paso de infraestructura silencioso, no un formulario.
    this.providerProfilesService.findMine().subscribe({
      next: () => this.afterProfileReady(),
      error: () => {
        this.providerProfilesService.activate('Partly').subscribe({
          next: () => this.afterProfileReady(),
          error: (message: string) => this.errorMessage.set(message),
        });
      },
    });
  }

  private afterProfileReady(): void {
    this.ready.set(true);
    this.loadListings();
    this.loadOrders();
  }

  private loadListings(): void {
    this.providerListingsService.findMine().subscribe({
      next: (listings) => this.listings.set(listings),
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  private loadOrders(): void {
    this.providerOrdersService.findAsProvider().subscribe({
      next: (page) => this.orders.set(page.data),
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  protected openOrder(order: ProviderOrder): void {
    this.router.navigate(['/admin/mi-tienda/pedidos', order.id]);
  }

  /** Pendiente = en marcha (falta pago, validar o entregar); aprobado = completada; rechazado = rechazada o cancelada. */
  protected orderGroup(order: ProviderOrder): 'PENDING' | 'APPROVED' | 'REJECTED' {
    if (order.status === 'FULFILLED') return 'APPROVED';
    if (order.status === 'REJECTED' || order.status === 'CANCELLED') return 'REJECTED';
    return 'PENDING';
  }

  protected orderStatus(order: ProviderOrder): { label: string; tone: string; dot: string } {
    switch (order.status) {
      case 'AWAITING_PAYMENT': return { label: 'Esperando pago', tone: 'bg-slate-100 text-on-surface-variant', dot: 'bg-slate-400' };
      case 'PENDING_APPROVAL': return { label: 'Por validar', tone: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' };
      case 'PENDING_DELIVERY': return { label: 'Por entregar', tone: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' };
      case 'FULFILLED': return { label: 'Entregada', tone: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' };
      case 'REJECTED': return { label: 'Rechazada', tone: 'bg-red-50 text-red-700', dot: 'bg-red-500' };
      default:
        return order.paidAt && !order.refundedAt
          ? { label: 'Cancelada · reembolso pendiente', tone: 'bg-red-50 text-red-700', dot: 'bg-red-500' }
          : { label: 'Cancelada', tone: 'bg-slate-100 text-on-surface-variant', dot: 'bg-slate-400' };
    }
  }

  /** Si el logo de la plataforma no carga, se muestra la tarjeta de color con su inicial. */
  protected markLogoBroken(listingId: string): void {
    this.brokenLogos.update((set) => new Set(set).add(listingId));
  }

  protected toggleMenu(id: string): void {
    this.menuId.update((current) => (current === id ? null : id));
  }

  protected viewReceipt(order: ProviderOrder): void {
    if (this.viewingReceiptId()) return;
    this.viewingReceiptId.set(order.id);
    this.providerOrdersService.getReceiptBlob(order.id).subscribe({
      next: (blob) => {
        this.viewingReceiptId.set(null);
        window.open(URL.createObjectURL(blob), '_blank');
      },
      error: (message: string) => {
        this.viewingReceiptId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  private applyOrder(request: () => ReturnType<ProviderOrdersService['approve']>, order: ProviderOrder): void {
    if (this.decidingOrderId()) return;
    this.decidingOrderId.set(order.id);
    this.deciderError.set(null);
    this.deciderErrorOrderId.set(null);
    request().subscribe({
      next: (updated) => {
        this.decidingOrderId.set(null);
        this.orders.update((list) => (list ?? []).map((o) => (o.id === updated.id ? updated : o)));
      },
      error: (message: string) => {
        this.decidingOrderId.set(null);
        this.deciderError.set(message);
        this.deciderErrorOrderId.set(order.id);
      },
    });
  }

  protected async approveOrder(order: ProviderOrder): Promise<void> {
    this.menuId.set(null);
    const ok = await this.confirmService.ask({
      title: `¿Ya llegaron $${order.unitPrice} a tu banco?`,
      text: order.kind === 'RENEWAL' ? 'Al confirmar, la vigencia de la cuenta se alarga.' : 'Al confirmar pasa a entrega: podrás enviarle las credenciales.',
      confirmText: 'Sí, ya llegó',
    });
    if (!ok) return;
    this.applyOrder(() => this.providerOrdersService.approve(order.id), order);
  }

  protected async rejectOrder(order: ProviderOrder): Promise<void> {
    this.menuId.set(null);
    const reason = await this.confirmService.prompt({
      title: 'Rechazar la solicitud',
      text: 'La cuenta vuelve al inventario y el comprador verá el motivo.',
      placeholder: 'Motivo (opcional)',
      confirmText: 'Rechazar solicitud',
    });
    if (reason === null) return;
    this.applyOrder(() => this.providerOrdersService.reject(order.id, reason || undefined), order);
  }

  protected async cancelPaidOrder(order: ProviderOrder): Promise<void> {
    this.menuId.set(null);
    const ok = await this.confirmService.ask({
      title: '¿Cancelar esta compra?',
      text: `El comprador ya pagó $${order.unitPrice}. La cuenta vuelve al inventario y queda pendiente devolverle el dinero.`,
      confirmText: 'Sí, cancelar',
      cancelText: 'Volver',
      danger: true,
    });
    if (!ok) return;
    this.applyOrder(() => this.providerOrdersService.cancel(order.id), order);
  }

  protected async markRefunded(order: ProviderOrder): Promise<void> {
    this.menuId.set(null);
    const ok = await this.confirmService.ask({
      title: '¿Ya le devolviste el dinero?',
      text: `Confirma que transferiste $${order.unitPrice} al comprador.`,
      confirmText: 'Sí, ya lo devolví',
    });
    if (!ok) return;
    this.applyOrder(() => this.providerOrdersService.markRefunded(order.id), order);
  }

  protected openDeliverForm(order: ProviderOrder): void {
    this.menuId.set(null);
    this.deliveringOrderId.set(order.id);
    this.deliverUsername.set('');
    this.deliverPassword.set('');
    this.deliverNotes.set('');
    this.deliverError.set(null);
  }

  protected closeDeliverForm(): void {
    this.deliveringOrderId.set(null);
  }

  protected submitDelivery(order: ProviderOrder): void {
    const username = this.deliverUsername().trim();
    const password = this.deliverPassword();
    if (!username || !password || this.savingDelivery()) {
      return;
    }
    this.savingDelivery.set(true);
    this.deliverError.set(null);
    this.providerOrdersService.deliver(order.id, { username, password, notes: this.deliverNotes().trim() || undefined }).subscribe({
      next: (updated) => {
        this.savingDelivery.set(false);
        this.deliveringOrderId.set(null);
        this.orders.update((list) => (list ?? []).map((o) => (o.id === updated.id ? updated : o)));
      },
      error: (message: string) => {
        this.savingDelivery.set(false);
        this.deliverError.set(message);
      },
    });
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  protected onMaxSlotsInput(value: string): void {
    this.maxSlotsInput.set(value === '' ? null : Number(value));
  }

  protected onOfficialPriceInput(value: string): void {
    this.officialPriceInput.set(value === '' ? null : Number(value));
  }

  protected onWholesaleInput(value: string): void {
    this.wholesalePriceInput.set(value === '' ? null : Number(value));
  }

  protected onStockInput(value: string): void {
    this.stockQuantityInput.set(value === '' ? null : Number(value));
  }

  protected onValidityInput(value: string): void {
    this.validityDaysInput.set(value === '' ? null : Number(value));
  }

  protected openForm(): void {
    this.platformNameInput.set('');
    this.tierNameInput.set('');
    this.maxSlotsInput.set(null);
    this.officialPriceInput.set(null);
    this.wholesalePriceInput.set(null);
    this.stockQuantityInput.set(null);
    this.renewableInput.set(true);
    this.validityDaysInput.set(30);
    this.formError.set(null);
    this.publishedNotice.set(null);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
  }

  protected submitListing(): void {
    const platformName = this.platformNameInput().trim();
    const maxSlots = this.maxSlotsInput();
    const officialPrice = this.officialPriceInput();
    const wholesalePrice = this.wholesalePriceInput();
    const stockQuantity = this.stockQuantityInput();
    const validityDays = this.validityDaysInput();
    if (
      !validityDays || validityDays < 1 ||
      platformName.length < 2 ||
      maxSlots === null || maxSlots < 1 ||
      officialPrice === null || officialPrice <= 0 ||
      wholesalePrice === null || wholesalePrice <= 0 ||
      stockQuantity === null || stockQuantity < 0 ||
      this.saving()
    ) {
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    this.providerListingsService
      .create({
        platformName,
        tierName: this.tierNameInput().trim() || undefined,
        maxSlots,
        officialPrice,
        wholesalePrice,
        stockQuantity,
        renewable: this.renewableInput(),
        validityDays,
      })
      .subscribe({
        next: (listing) => {
          this.saving.set(false);
          this.formOpen.set(false);
          this.listings.update((list) => [listing, ...(list ?? [])]);
          this.publishedNotice.set(`${listing.plan.platform.name} publicada: ya aparece en Mayoreo para los vendedores.`);
        },
        error: (message: string) => {
          this.saving.set(false);
          this.formError.set(message);
        },
      });
  }

  protected updateWholesalePrice(listing: ProviderListing, value: string): void {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed === Number(listing.wholesalePrice)) {
      return;
    }
    this.saveUpdate(listing.id, { wholesalePrice: parsed });
  }

  protected updateStockQuantity(listing: ProviderListing, value: string): void {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed === listing.stockQuantity) {
      return;
    }
    this.saveUpdate(listing.id, { stockQuantity: parsed });
  }

  protected toggleActive(listing: ProviderListing): void {
    this.saveUpdate(listing.id, { active: !listing.active });
  }

  protected toggleRenewable(listing: ProviderListing): void {
    this.saveUpdate(listing.id, { renewable: !listing.renewable });
  }

  protected updateValidityDays(listing: ProviderListing, value: string): void {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 400 || parsed === listing.validityDays) {
      return;
    }
    this.saveUpdate(listing.id, { validityDays: parsed });
  }

  private saveUpdate(id: string, patch: { wholesalePrice?: number; stockQuantity?: number; active?: boolean; renewable?: boolean; validityDays?: number }): void {
    if (this.updatingId()) {
      return;
    }
    this.updatingId.set(id);
    this.providerListingsService.update(id, patch).subscribe({
      next: (updated) => {
        this.updatingId.set(null);
        this.listings.update((list) => (list ?? []).map((l) => (l.id === updated.id ? updated : l)));
      },
      error: (message: string) => {
        this.updatingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }
}
