import { afterNextRender, DestroyRef, Directive, ElementRef, inject, Input } from '@angular/core';
import { LenisScrollService } from '../../shared/lenis-scroll.service';

/** Loads the rich landing motion engine after the critical page paint. */
@Directive({ selector: '[appLandingMotion]', standalone: true })
export class LandingMotionDirective {
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  private readonly scrollService = inject(LenisScrollService);

  @Input() landingMotionMode: 'page' | 'section' = 'page';

  private destroyed = false;
  private cancelSchedule: (() => void) | undefined;
  private cleanupMotion: (() => void) | undefined;

  constructor() {
    afterNextRender(() => {
      const startMotion = async (): Promise<void> => {
        const [{ gsap, ScrollTrigger }, { mountLandingEffects }, { mountLandingScenes }] = await Promise.all([
          import('../../shared/gsap'),
          import('./landing-effects'),
          import('./landing-scenes'),
        ]);
        if (this.destroyed) return;

        const media = gsap.matchMedia();
        media.add('(prefers-reduced-motion: no-preference)', () => {
          let cleanupEffects: (() => void) | undefined;
          let cleanupScenes: (() => void) | undefined;
          const context = gsap.context(() => {
            cleanupEffects = mountLandingEffects(this.host, {
              global: this.landingMotionMode === 'page',
              scrollService: this.scrollService,
            });
            cleanupScenes = mountLandingScenes(this.host);

            const entrance = (selector: string, from: Record<string, number>, stagger = 0.1) => {
              const elements = gsap.utils.toArray<HTMLElement>(selector, this.host);
              const parents = new Set(elements.map(element => element.parentElement!));
              parents.forEach(parent => {
                const children = elements.filter(element => element.parentElement === parent);
                gsap.fromTo(children, { opacity: 0, ...from }, {
                  opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, rotationX: 0,
                  duration: 0.85, stagger, ease: 'back.out(1.25)', immediateRender: false,
                  scrollTrigger: {
                    trigger: parent, start: 'top 88%', end: 'bottom top',
                    toggleActions: 'restart none restart none',
                  },
                });
              });
            };

            entrance('.results-benefits article, .grace-benefits article, .credentials-benefits article', { x: -35, y: 14 });
            entrance('.intro-benefits article, .comparison-list li', { x: -24 }, 0.075);
            entrance('.groups-preview > div, .wallet-groups > div', { x: 30, scale: 0.94 }, 0.14);
            entrance('.owner-checks > span, .plan-tabs > button', { y: 25, scale: 0.85 }, 0.13);
            entrance('.security-card > div, .security-card > small', { y: 22 }, 0.15);
            entrance('.story-card > blockquote, .story-card > strong, .story-card > footer', { y: 28 }, 0.16);
            entrance('.cta-benefits > span', { y: 32, scale: 0.82 }, 0.18);
            entrance('.service-row > span', { y: 20, rotation: -12, scale: 0.7 }, 0.09);
            entrance('.footer-column > a, .footer-column > span', { x: -15 }, 0.07);

            const float = (selector: string, vars: Record<string, number>) => {
              gsap.utils.toArray<HTMLElement>(selector, this.host).forEach((element, index) => {
                const tween = gsap.to(element, {
                  ...vars, duration: 2.3 + (index % 4) * 0.45,
                  ease: 'sine.inOut', repeat: -1, yoyo: true, paused: true,
                });
                ScrollTrigger.create({
                  trigger: element.closest('section') ?? element,
                  start: 'top bottom', end: 'bottom top',
                  onEnter: () => tween.resume(), onEnterBack: () => tween.resume(),
                  onLeave: () => tween.pause(), onLeaveBack: () => tween.pause(),
                });
              });
            };

            float('.step-icon, .security-icon', { y: -7, rotation: 5 });
            float('.step-number', { y: -4, scale: 1.06 });
            float('.earning-box > mark, .sec-active-pill', { y: -5 });
            float('.catalog-badge, .owners-badge, .security-badge', { y: -6 });
            float('.platform-logo', { y: -6, rotation: -4 });

            gsap.utils.toArray<HTMLElement>('.groups-preview, .earning-box, .cta-badge', this.host)
              .forEach(element => {
                gsap.fromTo(element, { y: 12 }, {
                  y: -12, ease: 'none', immediateRender: false,
                  scrollTrigger: {
                    trigger: element.closest('section')!, start: 'top bottom',
                    end: 'bottom top', scrub: 1.2,
                  },
                });
              });
          }, this.host);

          const refresh = requestAnimationFrame(() => ScrollTrigger.refresh());
          return () => {
            cancelAnimationFrame(refresh);
            context.revert();
            cleanupScenes?.();
            cleanupEffects?.();
          };
        });
        this.cleanupMotion = () => media.revert();
      };

      if (this.landingMotionMode === 'page' && 'requestIdleCallback' in window) {
        const idleId = window.requestIdleCallback(() => void startMotion(), { timeout: 700 });
        this.cancelSchedule = () => window.cancelIdleCallback(idleId);
      } else {
        const timerId = window.setTimeout(() => void startMotion(), this.landingMotionMode === 'page' ? 180 : 0);
        this.cancelSchedule = () => window.clearTimeout(timerId);
      }
    });

    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.cancelSchedule?.();
      this.cleanupMotion?.();
    });
  }
}
