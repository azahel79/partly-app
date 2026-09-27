import { Directive, ElementRef, Input, OnDestroy, OnInit, inject } from '@angular/core';

/** Native, requestAnimationFrame-throttled parallax for decorative elements. */
@Directive({
  selector: '[appParallax]',
  standalone: true,
})
export class ParallaxDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef).nativeElement as HTMLElement;

  @Input() appParallax = 0.08;

  private observer: IntersectionObserver | null = null;
  private frame = 0;
  private visible = false;

  ngOnInit(): void {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.el.style.willChange = 'translate';
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible) this.scheduleUpdate();
    }, { rootMargin: '120px 0px', threshold: 0 });
    this.observer.observe(this.el);
    window.addEventListener('scroll', this.scheduleUpdate, { passive: true });
    window.addEventListener('resize', this.scheduleUpdate, { passive: true });
  }

  ngOnDestroy(): void {
    if (typeof window === 'undefined') return;
    this.observer?.disconnect();
    window.removeEventListener('scroll', this.scheduleUpdate);
    window.removeEventListener('resize', this.scheduleUpdate);
    cancelAnimationFrame(this.frame);
    this.el.style.removeProperty('translate');
    this.el.style.removeProperty('will-change');
  }

  private readonly scheduleUpdate = (): void => {
    if (typeof window === 'undefined' || !this.visible || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const rect = this.el.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      const progress = Math.min(1, Math.max(0, (viewport - rect.top) / (viewport + rect.height)));
      const range = this.appParallax * 500;
      const y = range - progress * range * 2;
      this.el.style.translate = `0 ${y.toFixed(2)}px`;
    });
  };
}
