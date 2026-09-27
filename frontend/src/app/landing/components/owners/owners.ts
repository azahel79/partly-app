import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../../shared/reveal.directive';

interface OwnerPlan {
  label: string;
  name: string;
  pricePerSpot: number;
  maxSpots: number;
  icon?: string;
  letter?: string;
  iconBg: string;
  iconColor: string;
  badge?: string;
}

@Component({
  imports: [RevealDirective, RouterLink],
  selector: 'app-owners',
  styleUrl: './owners.css',
  templateUrl: './owners.html',
})
export class Owners {
  protected readonly plans: OwnerPlan[] = [
    {
      label: 'Netflix 4K',
      name: 'Netflix Premium',
      pricePerSpot: 89,
      maxSpots: 4,
      letter: 'N',
      iconBg: 'bg-ink',
      iconColor: 'text-[#E50914]',
      badge: '4K',
    },
    {
      label: 'Spotify Fam.',
      name: 'Spotify Familiar',
      pricePerSpot: 55,
      maxSpots: 5,
      icon: 'graphic_eq',
      iconBg: 'bg-emerald-600/15',
      iconColor: 'text-emerald-700',
    },
    {
      label: 'Disney+',
      name: 'Disney+ Combo',
      pricePerSpot: 65,
      maxSpots: 3,
      icon: 'play_circle',
      iconBg: 'bg-blue-600/15',
      iconColor: 'text-blue-700',
    },
  ];

  protected readonly selectedIndex = signal(0);
  protected readonly spots = signal(3);

  protected readonly selectedPlan = computed(() => this.plans[this.selectedIndex()]);

  protected readonly monthlyEarnings = computed(() => this.spots() * this.selectedPlan().pricePerSpot);
  protected readonly annualEarnings = computed(() => this.monthlyEarnings() * 12);

  protected readonly earningsPulse = signal(false);

  protected selectPlan(index: number): void {
    this.selectedIndex.set(index);
    const maxSpots = this.plans[index].maxSpots;
    if (this.spots() > maxSpots) {
      this.spots.set(maxSpots);
    }
    this.pulseEarnings();
  }

  protected onSpotsChange(value: string): void {
    this.spots.set(Number(value));
    this.pulseEarnings();
  }

  private pulseEarnings(): void {
    this.earningsPulse.set(false);
    if (typeof window === 'undefined') return;
    requestAnimationFrame(() => {
      this.earningsPulse.set(true);
      setTimeout(() => this.earningsPulse.set(false), 400);
    });
  }
}
