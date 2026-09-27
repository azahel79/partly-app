import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/reveal.directive';
import { CountUpDirective } from '../../shared/count-up.directive';
import { PlansService } from '../../shared/plans.service';
import { GroupsService } from '../../shared/groups.service';
import { Plan } from '../../shared/plans.models';
import { ScrollTrigger } from '../../shared/gsap';
import { platformLogoSrc } from '../../shared/platform-logo.util';

/** Nombres de plataforma que son claramente datos de prueba QA (nunca hubo una vista
 *  pública del catálogo antes de esta página, así que nadie los había limpiado). */
const TEST_NAME_PATTERN = /test/i;
/** Duplicados de "Disney+" mal capturados en pruebas — se excluyen de esta vista. */
const KNOWN_DUPLICATE_NAMES = new Set(['disney', 'disney premium']);

const KNOWN_BRAND_SLUGS: Record<string, string> = {
  netflix: 'netflix',
  spotify: 'spotify',
  'disney+': 'disneyplus',
  max: 'max',
  'hbo max': 'max',
  youtube: 'youtube',
  'youtube premium': 'youtube',
  canva: 'canva',
  crunchyroll: 'crunchyroll',
  'chatgpt plus': 'openai',
  'paramount+': 'paramountplus',
};

interface PlatformRow {
  platformId: string;
  platformName: string;
  logoUrl: string | null;
  tierName: string;
  maxSlots: number;
  officialPrice: number;
  perSlotPrice: number;
  savingsPercent: number;
}

@Component({
  selector: 'app-comparativa',
  imports: [RouterLink, RevealDirective, CountUpDirective, DecimalPipe],
  templateUrl: './comparativa.html',
  styleUrls: ['./comparativa.css', './comparativa-extra.css'],
})
export class Comparativa implements OnInit {
  private readonly plansService = inject(PlansService);
  private readonly groupsService = inject(GroupsService);

  protected readonly plans = signal<Plan[] | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly activeGroupsCount = signal<number | null>(null);

  protected readonly rows = computed<PlatformRow[]>(() => {
    const list = this.plans();
    if (!list) {
      return [];
    }

    const bestByPlatform = new Map<string, PlatformRow>();
    for (const plan of list) {
      if (TEST_NAME_PATTERN.test(plan.platform.name) || KNOWN_DUPLICATE_NAMES.has(plan.platform.name.trim().toLowerCase())) {
        continue;
      }
      const officialPrice = Number(plan.officialPrice);
      const perSlotPrice = officialPrice / plan.maxSlots;
      const savingsPercent = plan.maxSlots > 0 ? (1 - 1 / plan.maxSlots) * 100 : 0;
      const existing = bestByPlatform.get(plan.platform.id);
      if (!existing || plan.maxSlots > existing.maxSlots) {
        bestByPlatform.set(plan.platform.id, {
          platformId: plan.platform.id,
          platformName: plan.platform.name,
          logoUrl: this.logoFor(plan.platform.name),
          tierName: plan.tierName,
          maxSlots: plan.maxSlots,
          officialPrice,
          perSlotPrice,
          savingsPercent,
        });
      }
    }

    return Array.from(bestByPlatform.values()).sort((a, b) => a.platformName.localeCompare(b.platformName));
  });

  protected readonly overallStats = computed(() => {
    const list = this.rows();
    if (list.length === 0) {
      return null;
    }
    const avgSavings = list.reduce((sum, r) => sum + r.savingsPercent, 0) / list.length;
    return {
      servicesCount: list.length,
      avgSavingsPercent: Math.round(avgSavings),
    };
  });

  ngOnInit(): void {
    // El precio table y las notas/CTA de más abajo cambian la altura de la página
    // una vez que llegan los planes — sin este refresh, los [appReveal] posteriores
    // (footer incluido) quedan con triggers calculados contra la altura vieja, más
    // corta, y nunca se disparan. Mismo patrón que CarouselDirective usa para Embla.
    this.plansService.listActive().subscribe({
      next: (res) => {
        this.plans.set(res.data);
        if (typeof window !== 'undefined') requestAnimationFrame(() => ScrollTrigger.refresh());
      },
      error: (message: string) => this.errorMessage.set(message),
    });
    this.groupsService.publicStats().subscribe({
      next: (res) => {
        this.activeGroupsCount.set(res.activeGroupsCount);
        if (typeof window !== 'undefined') requestAnimationFrame(() => ScrollTrigger.refresh());
      },
      error: () => undefined,
    });
  }

  private logoFor(platformName: string): string | null {
    const key = platformName.trim().toLowerCase();
    const slug = KNOWN_BRAND_SLUGS[key] ?? Object.entries(KNOWN_BRAND_SLUGS).find(([name]) => key.startsWith(name))?.[1];
    return platformLogoSrc(platformName) ?? (slug ? `https://cdn.simpleicons.org/${slug}` : null);
  }

  protected formatMoney(value: number): string {
    return value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  protected hideBrokenImage(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}
