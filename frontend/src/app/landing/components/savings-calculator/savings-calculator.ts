import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Plan } from '../../../shared/plans.models';
import { PlansService } from '../../../shared/plans.service';
import { RevealDirective } from '../../../shared/reveal.directive';
import { LandingAnalyticsService } from '../../../shared/landing-analytics.service';
import { TrackEventDirective } from '../../../shared/track-event.directive';

const TEST_NAME_PATTERN = /test/i;

@Component({
  selector: 'app-savings-calculator',
  imports: [RouterLink, RevealDirective, TrackEventDirective],
  templateUrl: './savings-calculator.html',
  styleUrl: './savings-calculator.css',
})
export class SavingsCalculator implements OnInit {
  private readonly plansService = inject(PlansService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly analytics = inject(LandingAnalyticsService);

  protected readonly plans = signal<Plan[] | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly selectedPlanId = signal('');
  protected readonly shareCount = signal(2);

  protected readonly selectedPlan = computed(() => {
    const plans = this.plans() ?? [];
    return plans.find((plan) => plan.id === this.selectedPlanId()) ?? plans[0] ?? null;
  });

  protected readonly officialPrice = computed(() => Number(this.selectedPlan()?.officialPrice ?? 0));
  protected readonly sharedPrice = computed(() => this.officialPrice() / Math.max(1, this.shareCount()));
  protected readonly monthlySaving = computed(() => this.officialPrice() - this.sharedPrice());
  protected readonly savingPercent = computed(() => Math.round((1 - 1 / Math.max(1, this.shareCount())) * 100));

  ngOnInit(): void {
    this.loadPlans();
  }

  protected loadPlans(): void {
    this.errorMessage.set(null);
    this.plans.set(null);
    this.plansService
      .listActive()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const plans = response.data.filter((plan) => plan.maxSlots > 1 && !TEST_NAME_PATTERN.test(plan.platform.name));
          this.plans.set(plans);
          if (plans[0]) {
            this.selectedPlanId.set(plans[0].id);
            this.shareCount.set(Math.min(2, plans[0].maxSlots));
          }
        },
        error: () => {
          this.plans.set([]);
          this.errorMessage.set('No pudimos consultar los planes activos. Revisa tu conexión e inténtalo de nuevo.');
        },
      });
  }

  protected selectPlan(planId: string): void {
    this.selectedPlanId.set(planId);
    const plan = this.plans()?.find((item) => item.id === planId);
    if (plan && this.shareCount() > plan.maxSlots) {
      this.shareCount.set(plan.maxSlots);
    }
    if (plan) {
      this.analytics.track('landing_calculator_plan_selected', { platform: plan.platform.name, tier: plan.tierName });
    }
  }

  protected updateShareCount(value: string): void {
    this.shareCount.set(Number(value));
  }

  protected trackShareCount(): void {
    this.analytics.track('landing_calculator_people_changed', { people: this.shareCount() });
  }

  protected formatMoney(value: number): string {
    return value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
