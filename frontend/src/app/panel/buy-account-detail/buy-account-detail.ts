import { periodAdjective } from '../../shared/billing-period.util';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProviderListingsService } from '../../shared/provider-listings.service';
import { ProviderOrdersService } from '../../shared/provider-orders.service';
import { WholesaleAccessService } from '../../shared/wholesale-access.service';
import { ProviderListing } from '../../shared/provider-listings.models';
import { MyWholesaleAccess } from '../../shared/wholesale-access.models';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';
import { MoneyPipe } from '../../shared/money';

@Component({
  imports: [RouterLink, PlatformLogo, MoneyPipe],
  selector: 'app-buy-account-detail',
  styleUrl: './buy-account-detail.css',
  templateUrl: './buy-account-detail.html',
})
export class BuyAccountDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly providerListingsService = inject(ProviderListingsService);
  private readonly providerOrdersService = inject(ProviderOrdersService);
  private readonly wholesaleAccessService = inject(WholesaleAccessService);


  protected readonly listing = signal<ProviderListing | null | undefined>(undefined);
  protected readonly access = signal<MyWholesaleAccess | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);

  /** Ahorro frente al precio oficial de la cuenta completa. */
  protected readonly saving = computed(() => {
    const l = this.listing();
    if (!l) {
      return null;
    }
    const official = Number(l.plan.officialPrice);
    const wholesale = Number(l.wholesalePrice);
    return wholesale < official ? { amount: official - wholesale, pct: Math.round((1 - wholesale / official) * 100) } : null;
  });

  protected readonly capReached = computed(() => {
    const a = this.access();
    return !!a && a.monthlyCap !== null && a.usedThisMonth >= a.monthlyCap;
  });

  private get listingId(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    this.wholesaleAccessService.getMine().subscribe({ next: (a) => this.access.set(a), error: () => undefined });
    this.providerListingsService.findById(this.listingId).subscribe({
      next: (listing) => this.listing.set(listing),
      error: (message: string) => {
        this.listing.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  protected billingPeriodLabel(period: string): string {
    return periodAdjective(period);
  }

  /** Reserva la cuenta y lleva al comprador a la pantalla de pago (transferencia + comprobante). */
  protected reserve(): void {
    if (this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.providerOrdersService.create(this.listingId).subscribe({
      next: (order) => {
        this.submitting.set(false);
        this.router.navigate(['/panel/mayoreo/compras', order.id]);
      },
      error: (message: string) => {
        this.submitting.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected goToMayoreo(): void {
    this.router.navigateByUrl('/panel/mayoreo');
  }
}
