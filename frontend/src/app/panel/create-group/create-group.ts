import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GroupsService } from '../../shared/groups.service';
import { ProviderOrdersService } from '../../shared/provider-orders.service';
import { UsersService } from '../../shared/users.service';
import { inspectClabe } from '../../shared/clabe.util';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';
import { MoneyPipe } from '../../shared/money';

/**
 * Solo una ESTIMACIÓN para este formulario: el % real lo asigna un ADMIN caso por caso al
 * aprobar el grupo (ver GroupsService.reviewApproval) y se le notifica al vendedor. Por eso
 * la ganancia se muestra como un rango entre la comisión más baja y la más alta esperadas.
 */
const COMMISSION_MIN_PCT = 10;
const COMMISSION_MAX_PCT = 15;

@Component({
  imports: [RouterLink, PlatformLogo, MoneyPipe],
  selector: 'app-create-group',
  styleUrl: './create-group.css',
  templateUrl: './create-group.html',
})
export class CreateGroup implements OnInit {
  private readonly groupsService = inject(GroupsService);
  private readonly providerOrdersService = inject(ProviderOrdersService);
  private readonly usersService = inject(UsersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Si vienes de "Crear mi grupo con esta cuenta" en /panel/mayoreo, el plan y la credencial ya están definidos por la compra. */
  protected readonly providerOrderId = signal<string | null>(null);
  protected readonly loadingOrder = signal(false);
  protected readonly orderReady = signal(false);
  protected readonly providerName = signal<string | null>(null);
  /** True cuando la CLABE se autocompletó desde la cuenta de abono guardada en el perfil. */
  protected readonly bankFromProfile = signal(false);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly step = signal<1 | 2 | 3>(1);
  protected readonly maxStepReached = signal<1 | 2 | 3>(1);

  protected readonly platformName = signal('');
  protected readonly tierName = signal('');
  protected readonly maxSlots = signal(4);
  protected readonly officialPrice = signal<number | null>(null);
  protected readonly totalSalePrice = signal<number | null>(null);

  protected readonly ownerUsesSlot = signal(true);
  protected readonly availableSlots = signal(1);
  protected readonly pricePerSlot = signal(0);
  protected readonly billingDay = signal(1);
  protected readonly bankAccountNumber = signal('');
  protected readonly bankName = signal('');
  protected readonly clabeInfo = computed(() => inspectClabe(this.bankAccountNumber()));

  protected readonly dayPickerOpen = signal(false);
  protected readonly calendarDays = Array.from({ length: 31 }, (_, i) => i + 1);
  protected readonly billingDayOptions = [1, 5, 10, 15, 20, 25, 28];
  protected readonly banks = ['BBVA', 'Santander', 'Banorte', 'HSBC', 'Citibanamex', 'Banco Azteca', 'Mercado Pago', 'Otro'];
  protected readonly slotOptions = [1, 2, 3, 4, 5, 6];
  protected readonly previewSlots = computed(() => Array.from({ length: Math.min(this.maxSlots(), 5) }));
  protected readonly availableSlotOptions = computed(() => Array.from({ length: this.sellableSlots() }, (_, index) => index + 1));

  protected readonly commissionMin = COMMISSION_MIN_PCT;
  protected readonly commissionMax = COMMISSION_MAX_PCT;

  /** Prioriza el precio de venta que tú defines; si no lo diste, cae a un reparto parejo de tu costo. */
  protected readonly suggestedPrice = computed(() => {
    const slots = this.maxSlots();
    if (slots <= 0) {
      return 0;
    }
    const salePrice = this.totalSalePrice();
    if (salePrice) {
      return Math.ceil(salePrice / slots);
    }
    const cost = this.officialPrice();
    if (cost) {
      return Math.ceil(cost / slots);
    }
    return 0;
  });

  /** Lo que pagan en total tus miembros (bruto, antes de la comisión de Partly). */
  protected readonly totalCollected = computed(() => this.pricePerSlot() * this.availableSlots());

  /** Lo que llegaría a tu wallet por un mes completo: va de la comisión más alta a la más baja. */
  protected readonly netReceivedRange = computed(() => this.netRange(this.totalCollected()));

  /** Tu margen mensual (lo que recibes menos lo que tú pagas por la suscripción). Null si no declaraste tu costo. */
  protected readonly marginRange = computed(() => {
    const cost = this.officialPrice();
    if (cost === null) {
      return null;
    }
    const net = this.netReceivedRange();
    return { low: net.low - cost, high: net.high - cost };
  });

  /** Proyección cuando se ocupan todos los cupos ofrecidos; alimenta la tarjeta "Ganancia estimada". */
  protected readonly estimatedFullMarginRange = computed(() => {
    const price = this.pricePerSlot();
    if (price <= 0) {
      return { low: 0, high: 0 };
    }
    const cost = this.officialPrice() ?? 0;
    const slots = this.step() === 1 ? this.sellableSlots() : this.availableSlots();
    const net = this.netRange(price * slots);
    return { low: net.low - cost, high: net.high - cost };
  });

  /** true = ni con la comisión más baja recuperas tu costo; "riesgo" = solo con la más baja. */
  protected readonly lossLevel = computed<'none' | 'risk' | 'loss'>(() => {
    const margin = this.marginRange();
    if (!margin) {
      return 'none';
    }
    return margin.high < 0 ? 'loss' : margin.low < 0 ? 'risk' : 'none';
  });

  /** Precio por cupo que cubre tu costo incluso con la comisión más alta (15%), para que nunca pierdas. */
  protected readonly breakEvenPricePerSlot = computed(() => {
    const cost = this.officialPrice();
    const slots = this.availableSlots();
    if (!cost || slots <= 0) {
      return null;
    }
    return Math.ceil(cost / (slots * (1 - COMMISSION_MAX_PCT / 100)));
  });

  protected formatRange(range: { low: number; high: number }): string {
    const low = Math.round(range.low);
    const high = Math.round(range.high);
    return low === high ? `$${low}` : `$${low} – $${high}`;
  }

  private netRange(gross: number): { low: number; high: number } {
    return {
      low: gross * (1 - COMMISSION_MAX_PCT / 100),
      high: gross * (1 - COMMISSION_MIN_PCT / 100),
    };
  }

  ngOnInit(): void {
    this.usersService.getPayoutAccount().subscribe({
      next: (account) => {
        if (account && !this.bankAccountNumber()) {
          this.bankAccountNumber.set(account.clabe);
          this.bankName.set(inspectClabe(account.clabe).bankName ?? account.bankName);
          this.bankFromProfile.set(true);
        }
      },
      error: () => undefined,
    });

    const orderId = this.route.snapshot.queryParamMap.get('providerOrderId');
    if (!orderId) {
      return;
    }
    this.providerOrderId.set(orderId);
    this.loadingOrder.set(true);
    this.providerOrdersService.findById(orderId).subscribe({
      next: (order) => {
        this.loadingOrder.set(false);
        if (order.status !== 'FULFILLED') {
          this.errorMessage.set('Esta compra todavía no tiene las credenciales entregadas por el proveedor.');
          return;
        }
        if (order.resultingGroupId) {
          this.errorMessage.set('Ya creaste un grupo con esta compra.');
          return;
        }
        this.platformName.set(order.listing.platform.name);
        this.tierName.set(order.listing.tierName);
        this.maxSlots.set(order.listing.maxSlots);
        this.officialPrice.set(Number(order.unitPrice));
        this.providerName.set(order.listing.providerProfile.businessName);
        this.orderReady.set(true);
      },
      error: (message: string) => {
        this.loadingOrder.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected readonly canAdvanceFromStep1 = computed(() => this.platformName().trim().length >= 2 && this.maxSlots() >= 2);
  protected readonly canAdvanceFromStep2 = computed(() => this.availableSlots() >= 1 && this.pricePerSlot() > 0);

  /** Cupos que en verdad puedes ofrecer a otros: todos, o todos menos el que tú reservas. */
  protected readonly sellableSlots = computed(() =>
    this.ownerUsesSlot() ? Math.max(1, this.maxSlots() - 1) : this.maxSlots(),
  );

  protected adjustMaxSlots(delta: number): void {
    this.maxSlots.update((current) => Math.max(2, current + delta));
    this.availableSlots.update((current) => Math.min(this.sellableSlots(), current));
  }

  protected setMaxSlots(value: number): void {
    this.maxSlots.set(value);
    this.availableSlots.update((current) => Math.min(this.sellableSlots(), current));
  }

  protected setOwnerUsesSlot(value: boolean): void {
    this.ownerUsesSlot.set(value);
    this.availableSlots.update((current) => Math.min(current, this.sellableSlots()));
  }

  protected adjustSlots(delta: number): void {
    const max = this.sellableSlots();
    this.availableSlots.update((current) => Math.min(max, Math.max(1, current + delta)));
  }

  protected setAvailableSlots(value: number): void {
    this.availableSlots.set(Math.min(this.sellableSlots(), Math.max(1, value)));
  }

  protected toggleDayPicker(): void {
    this.dayPickerOpen.update((open) => !open);
  }

  protected selectDay(day: number): void {
    this.billingDay.set(day);
    this.dayPickerOpen.set(false);
  }

  protected updateClabe(value: string): void {
    this.bankFromProfile.set(false);
    const info = inspectClabe(value);
    this.bankAccountNumber.set(info.digits);
    this.bankName.set(info.bankName ?? '');
  }

  protected applySuggestedPrice(): void {
    if (this.suggestedPrice() > 0) {
      this.pricePerSlot.set(this.suggestedPrice());
    }
  }

  protected applyBreakEvenPrice(): void {
    const price = this.breakEvenPricePerSlot();
    if (price !== null && price > 0) {
      this.pricePerSlot.set(price);
    }
  }

  protected goToStep(target: 1 | 2 | 3): void {
    if (target <= this.maxStepReached()) {
      this.step.set(target);
    }
  }

  protected nextStep(): void {
    if (this.step() === 1 && this.canAdvanceFromStep1()) {
      // Primera vez que llega al paso 2: precarga con lo que ya dijo en el paso 1,
      // para no hacerle repetir "cuántos cupos" ni obligarlo a pedir el precio sugerido a mano.
      if (this.maxStepReached() < 2) {
        this.availableSlots.set(this.sellableSlots());
        if (this.pricePerSlot() === 0 && this.suggestedPrice() > 0) {
          this.pricePerSlot.set(this.suggestedPrice());
        }
      }
      this.step.set(2);
    } else if (this.step() === 2 && this.canAdvanceFromStep2()) {
      this.step.set(3);
    }
    this.maxStepReached.set(Math.max(this.maxStepReached(), this.step()) as 1 | 2 | 3);
  }

  protected prevStep(): void {
    if (this.step() > 1) {
      this.step.set((this.step() - 1) as 1 | 2 | 3);
    }
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (!this.canAdvanceFromStep1() || !this.canAdvanceFromStep2() || this.submitting()) {
      return;
    }
    if (this.bankAccountNumber() && !this.clabeInfo().isValid) {
      this.errorMessage.set('La CLABE debe tener 18 dígitos y un dígito verificador válido.');
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const bankAccountNumber = [this.bankName(), this.bankAccountNumber().trim()].filter(Boolean).join(' · ') || undefined;
    const orderId = this.providerOrderId();

    const request$ = orderId
      ? this.providerOrdersService.createGroup(orderId, {
          pricePerSlot: this.pricePerSlot(),
          availableSlots: this.availableSlots(),
          bankAccountNumber,
        })
      : this.groupsService.create({
          platformName: this.platformName().trim(),
          tierName: this.tierName().trim() || undefined,
          maxSlots: this.maxSlots(),
          officialPrice: this.officialPrice() ?? undefined,
          pricePerSlot: this.pricePerSlot(),
          availableSlots: this.availableSlots(),
          bankAccountNumber,
        });

    request$.subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigateByUrl('/panel/grupos');
      },
      error: (message: string) => {
        this.submitting.set(false);
        this.errorMessage.set(message);
      },
    });
  }
}
