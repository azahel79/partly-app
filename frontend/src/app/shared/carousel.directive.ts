import { AfterViewInit, Directive, ElementRef, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';
import EmblaCarousel, { EmblaCarouselType, EmblaOptionsType, EmblaPluginType } from 'embla-carousel';
import { ScrollTrigger } from './gsap';

/**
 * Thin wrapper around Embla Carousel's vanilla core. The host is Embla's
 * "viewport" element — its single direct child is the "container" holding
 * the slides in a row. Embla only takes over once the viewport actually
 * overflows (drag/scroll-snap); if a parent switches the container to a
 * CSS grid at a wider breakpoint, Embla just goes inert there — no separate
 * desktop/mobile init needed. Emits its API via `appCarouselReady` so the
 * host component can wire up dots/arrows.
 */
@Directive({
  selector: '[appCarousel]',
  standalone: true,
})
export class CarouselDirective implements AfterViewInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  @Input() appCarouselOptions: EmblaOptionsType = {};
  @Input() appCarouselPlugins: EmblaPluginType[] = [];
  @Output() appCarouselReady = new EventEmitter<EmblaCarouselType>();

  private embla: EmblaCarouselType | null = null;
  private observer: IntersectionObserver | null = null;
  private carouselVisible = true;
  private autoplay: { play: () => void; stop: () => void } | null = null;
  private readonly syncAutoplay = () => {
    if (!this.autoplay) return;
    if (this.carouselVisible && !document.hidden) this.autoplay.play();
    else this.autoplay.stop();
  };

  ngAfterViewInit(): void {
    if (typeof window === 'undefined') return;
    this.embla = EmblaCarousel(this.el, { loop: false, align: 'start', ...this.appCarouselOptions }, this.appCarouselPlugins);
    this.appCarouselReady.emit(this.embla);
    this.autoplay = (this.embla.plugins() as unknown as Record<string, { play: () => void; stop: () => void }>)['autoplay'] ?? null;
    if (this.autoplay && 'IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(entries => {
        this.carouselVisible = entries[0]?.isIntersecting ?? false;
        this.syncAutoplay();
      }, { rootMargin: '160px 0px', threshold: 0.01 });
      this.observer.observe(this.el);
      document.addEventListener('visibilitychange', this.syncAutoplay);
    }

    // Embla resizes/repositions slides on init, which can leave any
    // [appReveal] ScrollTrigger inside it holding stale trigger positions
    // measured before that layout pass — force a recalculation.
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }

  ngOnDestroy(): void {
    if (typeof window === 'undefined') return;
    this.observer?.disconnect();
    document.removeEventListener('visibilitychange', this.syncAutoplay);
    this.embla?.destroy();
  }
}
