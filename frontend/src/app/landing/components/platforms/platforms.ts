import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmblaCarouselType, EmblaPluginType } from 'embla-carousel';
import Autoplay from 'embla-carousel-autoplay';
import { RevealDirective } from '../../../shared/reveal.directive';
import { TiltDirective } from '../../../shared/tilt.directive';
import { CarouselDirective } from '../../../shared/carousel.directive';
import { prefersReducedMotion } from '../../../shared/gsap';
import { Group } from '../../../shared/groups.models';
import { GroupsService } from '../../../shared/groups.service';
import { TrackEventDirective } from '../../../shared/track-event.directive';

type MockupType = 'poster' | 'music' | 'icon';

interface PlatformTile {
  name: string;
  description: string;
  features: string[];
  icon?: string;
  letter?: string;
  iconBg: string;
  iconColor: string;
  bannerFrom: string;
  bannerTo: string;
  mockup: MockupType;
  badge?: string;
}

interface InventorySummary {
  groups: number;
  freeSlots: number;
  lowestPrice: number;
}

const FEATURE_ICONS: Record<string, string> = {
  'Ultra HD': 'hd',
  'Varios perfiles': 'group',
  Descargas: 'download',
  'Sin anuncios': 'block',
  'Sin anuncios (Premium)': 'block',
  'Modo offline': 'wifi_off',
  'Listas personalizadas': 'queue_music',
  'Hasta 4 dispositivos': 'devices',
  'YouTube Music': 'music_note',
  'Envíos Prime': 'local_shipping',
  'Audio espacial': 'spatial_audio',
  'Subtítulos y doblaje': 'closed_caption',
  'Plantillas premium': 'auto_awesome',
  'Fondo removedor': 'layers_clear',
  'Más almacenamiento': 'cloud',
  'Vidas ilimitadas': 'favorite',
  'Lecciones offline': 'wifi_off',
  'Modelos avanzados': 'psychology',
  'Prioridad de acceso': 'bolt',
  'Uso extendido': 'all_inclusive',
  'Más capacidad': 'speed',
  Prioridad: 'bolt',
};

@Component({
  imports: [RevealDirective, TiltDirective, CarouselDirective, RouterLink, TrackEventDirective],
  selector: 'app-platforms',
  styleUrl: './platforms.css',
  templateUrl: './platforms.html',
})
export class Platforms implements OnInit {
  private readonly groupsService = inject(GroupsService);

  protected readonly availableGroups = signal<Group[] | null>(null);
  protected readonly inventoryError = signal(false);
  protected readonly inventoryByPlatform = computed(() => {
    const summaries = new Map<string, InventorySummary>();
    for (const group of this.availableGroups() ?? []) {
      if (!group.canJoinNow || group.freeSlots < 1) {
        continue;
      }
      const key = this.platformKey(group.plan.platform.name);
      const price = Number(group.pricePerSlot);
      if (!Number.isFinite(price)) {
        continue;
      }
      const current = summaries.get(key);
      summaries.set(key, {
        groups: (current?.groups ?? 0) + 1,
        freeSlots: (current?.freeSlots ?? 0) + group.freeSlots,
        lowestPrice: current ? Math.min(current.lowestPrice, price) : price,
      });
    }
    return summaries;
  });

  protected readonly tiles: PlatformTile[] = [
    {
      name: 'Netflix',
      description: 'Series, películas y documentales de todo el mundo.',
      features: ['Ultra HD', 'Varios perfiles', 'Descargas'],
      letter: 'N',
      iconBg: 'bg-ink',
      iconColor: 'text-[#E50914]',
      bannerFrom: 'from-ink',
      bannerTo: 'to-[#5a0b12]',
      mockup: 'poster',
      badge: 'Más popular',
    },
    {
      name: 'Spotify',
      description: 'Música, podcasts y más, sin límites.',
      features: ['Sin anuncios', 'Modo offline', 'Listas personalizadas'],
      icon: 'graphic_eq',
      iconBg: 'bg-[#1DB954]/15',
      iconColor: 'text-[#1DB954]',
      bannerFrom: 'from-emerald-500',
      bannerTo: 'to-emerald-800',
      mockup: 'music',
    },
    {
      name: 'Disney+',
      description: 'Películas, series y contenido exclusivo de Disney, Pixar, Marvel y más.',
      features: ['Hasta 4 dispositivos', 'Ultra HD', 'Descargas'],
      icon: 'play_circle',
      iconBg: 'bg-blue-500/15',
      iconColor: 'text-blue-600',
      bannerFrom: 'from-blue-600',
      bannerTo: 'to-indigo-900',
      mockup: 'poster',
    },
    {
      name: 'HBO Max',
      description: 'Las mejores series, películas y contenido exclusivo.',
      features: ['Sin anuncios', 'Ultra HD', 'Varios perfiles'],
      icon: 'videocam',
      iconBg: 'bg-purple-600/15',
      iconColor: 'text-purple-700',
      bannerFrom: 'from-purple-700',
      bannerTo: 'to-ink',
      mockup: 'poster',
    },
    {
      name: 'YouTube',
      description: 'Videos, creadores y contenido para todos los gustos.',
      features: ['Sin anuncios (Premium)', 'Descargas', 'YouTube Music'],
      icon: 'smart_display',
      iconBg: 'bg-red-500/15',
      iconColor: 'text-red-600',
      bannerFrom: 'from-red-600',
      bannerTo: 'to-ink',
      mockup: 'poster',
    },
    {
      name: 'Prime Video',
      description: 'Series, películas y Amazon Originals.',
      features: ['Envíos Prime', 'Descargas', 'Ultra HD'],
      icon: 'movie',
      iconBg: 'bg-cyan-600/15',
      iconColor: 'text-cyan-700',
      bannerFrom: 'from-cyan-700',
      bannerTo: 'to-ink',
      mockup: 'poster',
    },
  ];

  protected readonly dots = this.tiles.map((_, i) => i);
  protected readonly selectedIndex = signal(2);
  protected readonly carouselPlugins: EmblaPluginType[] = prefersReducedMotion()
    ? []
    : [Autoplay({ delay: 3500, stopOnInteraction: false, stopOnMouseEnter: true })];

  private embla: EmblaCarouselType | null = null;

  ngOnInit(): void {
    this.loadInventory();
  }

  protected loadInventory(): void {
    this.inventoryError.set(false);
    this.availableGroups.set(null);
    this.groupsService.findAvailable(1, 100, undefined, undefined, { withSpots: true }).subscribe({
      next: (response) => this.availableGroups.set(response.data),
      error: () => {
        this.availableGroups.set([]);
        this.inventoryError.set(true);
      },
    });
  }

  protected inventoryFor(platformName: string): InventorySummary | null {
    return this.inventoryByPlatform().get(this.platformKey(platformName)) ?? null;
  }

  protected formatMoney(value: number): string {
    return value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private platformKey(name: string): string {
    const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (normalized.includes('netflix')) return 'netflix';
    if (normalized.includes('spotify')) return 'spotify';
    if (normalized.includes('disney')) return 'disney';
    if (normalized.includes('hbo') || normalized === 'max') return 'max';
    if (normalized.includes('youtube')) return 'youtube';
    if (normalized.includes('prime')) return 'prime';
    return normalized;
  }

  protected featureIcon(feature: string): string {
    return FEATURE_ICONS[feature] ?? 'check_circle';
  }

  protected onCarouselReady(embla: EmblaCarouselType): void {
    this.embla = embla;
    const update = () => this.selectedIndex.set(embla.selectedScrollSnap());
    update();
    embla.on('select', update);
    embla.on('reInit', update);
  }

  protected scrollTo(index: number): void {
    this.embla?.scrollTo(index);
  }

  protected scrollPrev(): void {
    this.embla?.scrollPrev();
  }

  protected scrollNext(): void {
    this.embla?.scrollNext();
  }
}
