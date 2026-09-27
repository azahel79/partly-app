import { Directive, ElementRef, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { gsap, ScrollTrigger, prefersReducedMotion } from './gsap';

export type RevealVariant = 'up' | 'left' | 'right' | 'scale' | 'blur' | 'pop' | 'flip' | 'none';

interface VariantConfig {
  from: gsap.TweenVars;
  ease: string;
  duration: number;
}

const VARIANTS: Record<Exclude<RevealVariant, 'none'>, VariantConfig> = {
  up: { from: { y: 28 }, ease: 'power4.out', duration: 1.05 },
  left: { from: { x: -32 }, ease: 'power4.out', duration: 1.05 },
  right: { from: { x: 32 }, ease: 'power4.out', duration: 1.05 },
  scale: { from: { scale: 0.94 }, ease: 'power4.out', duration: 1.05 },
  // Suave, "premium" — para portadas de tarjeta y visuales destacados.
  blur: { from: { scale: 1.04, filter: 'blur(10px)' }, ease: 'power2.out', duration: 1.1 },
  // Rebote marcado — para badges, stickers y elementos que piden llamar la atención.
  pop: { from: { scale: 0.8 }, ease: 'back.out(1.7)', duration: 0.8 },
  // Voltea desde abajo, mismo lenguaje que el SplitText del hero — para encabezados de sección.
  flip: { from: { y: 18, rotateX: -40, transformOrigin: '50% 100%' }, ease: 'power3.out', duration: 0.95 },
};

/**
 * Adds `.is-visible` to the host and animates it in via GSAP every time it
 * scrolls into view — and reverses back out when it scrolls fully past in
 * either direction, so the entrance replays on every pass, not just the
 * first (scroll down past a section, back up into it, and it plays again).
 * Pair with the `[appReveal]` CSS in styles.css, which sets the static
 * hidden state (`.reveal-up/left/right/...`) so there's no
 * flash-of-visible-content before GSAP/JS take over. The paused tween is
 * built with `fromTo` (explicit start values) rather than `to` (which would
 * read "from" off the element's current/computed style) — with `to`, a
 * paused tween created before layout has settled can end up reading the
 * wrong starting values and rendering fully visible immediately.
 * `appRevealVariant="none"` skips the tween but still flips the class on
 * every pass, so dependent CSS (`.line-grow`, `.ring-progress`) replays too.
 * Use `appRevealDelay` for staggered groups (ms).
 */
@Directive({
  selector: '[appReveal]',
  standalone: true,
  host: {
    '[class]': 'hostClass',
  },
})
export class RevealDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  @Input() appRevealDelay = 0;
  @Input() appRevealVariant: RevealVariant = 'up';

  protected hostClass = '';

  private trigger: ScrollTrigger | null = null;
  private tween: gsap.core.Tween | null = null;

  ngOnInit(): void {
    this.hostClass = `reveal reveal-${this.appRevealVariant}`;
    const reveal = () => this.el.classList.add('is-visible');
    const hide = () => this.el.classList.remove('is-visible');

    if (typeof window === 'undefined') {
      this.hostClass += ' is-visible';
      return;
    }

    if (prefersReducedMotion()) {
      reveal();
      return;
    }

    if (this.appRevealVariant === 'none') {
      this.trigger = ScrollTrigger.create({
        trigger: this.el,
        start: 'top 88%',
        end: 'bottom 12%',
        onEnter: reveal,
        onEnterBack: reveal,
        onLeave: hide,
        onLeaveBack: hide,
      });
      return;
    }

    const variant = VARIANTS[this.appRevealVariant];
    this.tween = gsap.fromTo(
      this.el,
      { opacity: 0, ...variant.from },
      {
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        rotateX: 0,
        filter: 'blur(0px)',
        duration: variant.duration,
        ease: variant.ease,
        delay: this.appRevealDelay / 1000,
        paused: true,
        onStart: reveal,
        onReverseComplete: hide,
      },
    );

    this.trigger = ScrollTrigger.create({
      trigger: this.el,
      start: 'top 86%',
      end: 'bottom 8%',
      animation: this.tween,
      toggleActions: 'play reverse play reverse',
    });
  }

  ngOnDestroy(): void {
    this.trigger?.kill();
    this.tween?.kill();
  }
}
