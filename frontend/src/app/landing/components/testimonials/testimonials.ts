import { Component, signal } from '@angular/core';
import { EmblaCarouselType, EmblaPluginType } from 'embla-carousel';
import Autoplay from 'embla-carousel-autoplay';
import { RevealDirective } from '../../../shared/reveal.directive';
import { TiltDirective } from '../../../shared/tilt.directive';
import { prefersReducedMotion } from '../../../shared/gsap';

interface Testimonial {
  initials: string;
  name: string;
  handle?: string;
  avatarBg: string;
  avatarColor: string;
  quote: string;
  statIcon: string;
  statIconColor: string;
  statText: string;
  platformName: string;
  platformIcon?: string;
  platformLetter?: string;
  platformBg: string;
  platformColor: string;
  featured?: boolean;
}

@Component({
  imports: [RevealDirective, TiltDirective],
  selector: 'app-testimonials',
  styleUrl: './testimonials.css',
  templateUrl: './testimonials.html',
})
export class Testimonials {
  protected readonly testimonials: Testimonial[] = [
    {
      initials: 'VA',
      name: 'Valeria Arismendi',
      avatarBg: 'bg-ink',
      avatarColor: 'text-crema',
      quote:
        'Antes me daba pena pedirle la contraseña a mis amigos y que luego cambiaran la cuenta. Con Vakeva tengo mi perfil con PIN propio y sé que el débito es exacto.',
      statIcon: 'trending_down',
      statIconColor: 'text-pink',
      statText: 'Ahorro $180/mes compartiendo Netflix y Spotify',
      platformName: 'Netflix',
      platformLetter: 'N',
      platformBg: 'bg-ink',
      platformColor: 'text-[#E50914]',
    },
    {
      initials: 'MR',
      name: 'Mauricio Robledo',
      handle: '@miembrovakeva',
      avatarBg: 'bg-pink',
      avatarColor: 'text-white',
      quote:
        'Tenía 3 cupos libres en mi plan familiar de YouTube y Disney. Ahora Vakeva les cobra en automático y me deposita cada semana en mi CLABE sin tener que recordar nada.',
      statIcon: 'monetization_on',
      statIconColor: 'text-emerald-600',
      statText: 'Gano $620/mes cubriendo el costo total de mi cuenta familiar',
      platformName: 'YouTube Premium',
      platformIcon: 'smart_display',
      platformBg: 'bg-pink',
      platformColor: 'text-white',
      featured: true,
    },
    {
      initials: 'DL',
      name: 'Daniela Lozano',
      avatarBg: 'bg-ink',
      avatarColor: 'text-crema',
      quote:
        'Lo mejor es no tener que lidiar con transferencias chuecas ni grupos de WhatsApp molestos. El proceso de pago es idéntico a pagar cualquier servicio premium.',
      statIcon: 'verified',
      statIconColor: 'text-pink',
      statText: 'Cero problemas de cobranza o contraseñas compartidas por chat',
      platformName: 'Spotify',
      platformIcon: 'graphic_eq',
      platformBg: 'bg-emerald-600/15',
      platformColor: 'text-emerald-700',
    },
  ];

  protected readonly dots = this.testimonials.map((_, i) => i);
  protected readonly selectedIndex = signal(1);
  protected readonly carouselPlugins: EmblaPluginType[] = prefersReducedMotion()
    ? []
    : [Autoplay({ delay: 4500, stopOnInteraction: false, stopOnMouseEnter: true })];

  private embla: EmblaCarouselType | null = null;

  protected onCarouselReady(embla: EmblaCarouselType): void {
    this.embla = embla;
    const update = () => this.selectedIndex.set(embla.selectedScrollSnap());
    embla.on('select', update);
    embla.on('reInit', update);
    embla.scrollTo(1, true);
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
