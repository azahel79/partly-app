import { Directive, ElementRef, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { gsap, ScrollTrigger, prefersReducedMotion } from './gsap';

/**
 * Animates the host's text from 0 up to `appCountUp` every time it scrolls
 * into view, and back down when it scrolls out (either direction) — so the
 * count replays on every pass, not just the first. Built with `fromTo`
 * (explicit start value) rather than `to`, so a paused tween created before
 * layout settles can't end up rendering the final value immediately — see
 * the same note in reveal.directive.ts. Pairs well with `[appReveal]` on a
 * parent for the entrance fade, but works standalone too.
 */
@Directive({
  selector: '[appCountUp]',
  standalone: true,
})
export class CountUpDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  @Input({ required: true }) appCountUp = 0;
  @Input() countUpPrefix = '';
  @Input() countUpSuffix = '';
  @Input() countUpDecimals = 0;
  @Input() countUpDuration = 1.4;

  private trigger: ScrollTrigger | null = null;
  private tween: gsap.core.Tween | null = null;

  ngOnInit(): void {
    if (prefersReducedMotion()) {
      this.render(this.appCountUp);
      return;
    }

    const proxy = { val: 0 };
    this.render(0);

    this.tween = gsap.fromTo(
      proxy,
      { val: 0 },
      {
        val: this.appCountUp,
        duration: this.countUpDuration,
        ease: 'power2.out',
        paused: true,
        onUpdate: () => this.render(proxy.val),
      },
    );

    this.trigger = ScrollTrigger.create({
      trigger: this.el,
      start: 'top 90%',
      end: 'bottom 10%',
      animation: this.tween,
      toggleActions: 'play reverse play reverse',
    });
  }

  ngOnDestroy(): void {
    this.trigger?.kill();
    this.tween?.kill();
  }

  private render(value: number): void {
    const formatted = this.countUpDecimals > 0 ? value.toFixed(this.countUpDecimals) : Math.round(value).toString();
    this.el.textContent = `${this.countUpPrefix}${formatted}${this.countUpSuffix}`;
  }
}
