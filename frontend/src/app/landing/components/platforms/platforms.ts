import { Component, signal } from '@angular/core';
import { EmblaCarouselType, EmblaPluginType } from 'embla-carousel';
import Autoplay from 'embla-carousel-autoplay';
import { RevealDirective } from '../../../shared/reveal.directive';
import { TiltDirective } from '../../../shared/tilt.directive';
import { CarouselDirective } from '../../../shared/carousel.directive';
import { prefersReducedMotion } from '../../../shared/gsap';

type MockupType = 'poster' | 'music' | 'icon';

interface PlatformTile {
  name: string;
  price: string;
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
  imports: [RevealDirective, TiltDirective, CarouselDirective],
  selector: 'app-platforms',
  styleUrl: './platforms.css',
  templateUrl: './platforms.html',
})
export class Platforms {
  protected readonly tiles: PlatformTile[] = [
    {
      name: 'Netflix',
      price: 'Desde $89/mes',
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
      price: 'Desde $55/mes',
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
      price: 'Desde $65/mes',
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
      price: 'Desde $59/mes',
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
      price: 'Desde $49/mes',
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
      price: 'Desde $45/mes',
      description: 'Series, películas y Amazon Originals.',
      features: ['Envíos Prime', 'Descargas', 'Ultra HD'],
      icon: 'movie',
      iconBg: 'bg-cyan-600/15',
      iconColor: 'text-cyan-700',
      bannerFrom: 'from-cyan-700',
      bannerTo: 'to-ink',
      mockup: 'poster',
    },
    {
      name: 'Apple Music',
      price: 'Desde $48/mes',
      description: 'Más de 100 millones de canciones, sin anuncios.',
      features: ['Modo offline', 'Listas personalizadas', 'Audio espacial'],
      icon: 'music_note',
      iconBg: 'bg-pink-500/15',
      iconColor: 'text-pink',
      bannerFrom: 'from-pink-500',
      bannerTo: 'to-rose-800',
      mockup: 'music',
    },
    {
      name: 'Crunchyroll',
      price: 'Desde $39/mes',
      description: 'El catálogo de anime más grande, con simulcast cada temporada.',
      features: ['Sin anuncios', 'Descargas', 'Subtítulos y doblaje'],
      icon: 'animation',
      iconBg: 'bg-orange-500/15',
      iconColor: 'text-orange-600',
      bannerFrom: 'from-orange-500',
      bannerTo: 'to-ink',
      mockup: 'poster',
    },
    {
      name: 'Canva Pro',
      price: 'Desde $42/mes',
      description: 'Diseño gráfico profesional con miles de plantillas premium.',
      features: ['Plantillas premium', 'Fondo removedor', 'Más almacenamiento'],
      icon: 'palette',
      iconBg: 'bg-teal-500/15',
      iconColor: 'text-teal-700',
      bannerFrom: 'from-teal-500',
      bannerTo: 'to-sky-700',
      mockup: 'icon',
    },
    {
      name: 'Duolingo',
      price: 'Desde $35/mes',
      description: 'Aprende idiomas de forma divertida, sin límites de vidas.',
      features: ['Sin anuncios', 'Vidas ilimitadas', 'Lecciones offline'],
      icon: 'language',
      iconBg: 'bg-lime-500/15',
      iconColor: 'text-lime-700',
      bannerFrom: 'from-lime-500',
      bannerTo: 'to-emerald-700',
      mockup: 'icon',
    },
    {
      name: 'ChatGPT Plus',
      price: 'Desde $119/mes',
      description: 'Acceso prioritario a los modelos más avanzados de OpenAI.',
      features: ['Modelos avanzados', 'Prioridad de acceso', 'Uso extendido'],
      icon: 'psychology',
      iconBg: 'bg-emerald-600/15',
      iconColor: 'text-emerald-800',
      bannerFrom: 'from-emerald-700',
      bannerTo: 'to-ink',
      mockup: 'icon',
    },
    {
      name: 'Claude Pro',
      price: 'Desde $119/mes',
      description: 'Asistente de IA avanzado para trabajar, crear y pensar mejor.',
      features: ['Más capacidad', 'Modelos avanzados', 'Prioridad'],
      icon: 'bolt',
      iconBg: 'bg-amber-600/15',
      iconColor: 'text-amber-800',
      bannerFrom: 'from-amber-400',
      bannerTo: 'to-orange-700',
      mockup: 'icon',
    },
  ];

  protected readonly dots = this.tiles.map((_, i) => i);
  protected readonly selectedIndex = signal(3);
  protected readonly carouselPlugins: EmblaPluginType[] = prefersReducedMotion()
    ? []
    : [Autoplay({ delay: 3500, stopOnInteraction: false, stopOnMouseEnter: true })];

  private embla: EmblaCarouselType | null = null;

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
