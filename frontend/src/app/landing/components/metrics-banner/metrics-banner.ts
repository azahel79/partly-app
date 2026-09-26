import { AfterViewInit, Component, ElementRef, OnDestroy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../../shared/reveal.directive';
import { CountUpDirective } from '../../../shared/count-up.directive';
import { TiltDirective } from '../../../shared/tilt.directive';
import { gsap, prefersReducedMotion, ScrollTrigger } from '../../../shared/gsap';

@Component({
  imports: [RevealDirective, CountUpDirective, TiltDirective, RouterLink],
  selector: 'app-metrics-banner',
  styleUrl: './metrics-banner.css',
  templateUrl: './metrics-banner.html',
})
export class MetricsBanner implements AfterViewInit, OnDestroy {
  private readonly element = inject(ElementRef<HTMLElement>).nativeElement;
  private waveAnimation?: gsap.Context;
  private waveVisibilityHandler?: () => void;

  protected readonly weekdays = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  protected readonly calendarDays = Array.from({ length: 31 }, (_, i) => i + 1);
  protected readonly paymentDay = 20;

  ngAfterViewInit(): void {
    if (prefersReducedMotion()) return;

    this.waveAnimation = gsap.context(() => {
      const motions: gsap.core.Animation[] = [
        gsap.to('.results-bg-wave-a', { xPercent: 2.5, yPercent: 1.5, duration: 15, ease: 'sine.inOut', repeat: -1, yoyo: true, paused: true }),
        gsap.to('.results-bg-wave-b', { xPercent: -2.8, yPercent: -1.3, duration: 18, ease: 'sine.inOut', repeat: -1, yoyo: true, paused: true }),
        gsap.fromTo('.travelling-wave-one', { xPercent: 0 }, { xPercent: -50, duration: 10, ease: 'none', repeat: -1, force3D: true, paused: true }),
        gsap.fromTo('.travelling-wave-two', { xPercent: -50 }, { xPercent: 0, duration: 14, ease: 'none', repeat: -1, force3D: true, paused: true }),
        gsap.fromTo('.travelling-wave-three', { xPercent: 0 }, { xPercent: -50, duration: 18, ease: 'none', repeat: -1, force3D: true, paused: true }),
        gsap.fromTo('.transition-wave-one', { xPercent: -50 }, { xPercent: 0, duration: 12, ease: 'none', repeat: -1, force3D: true, paused: true }),
        gsap.fromTo('.transition-wave-two', { xPercent: 0 }, { xPercent: -50, duration: 17, ease: 'none', repeat: -1, force3D: true, paused: true }),
        gsap.fromTo('.exit-wave-one', { xPercent: 0 }, { xPercent: -50, duration: 14, ease: 'none', repeat: -1, force3D: true, paused: true }),
        gsap.fromTo('.exit-wave-two', { xPercent: -50 }, { xPercent: 0, duration: 20, ease: 'none', repeat: -1, force3D: true, paused: true }),
        gsap.to('.wave-orbit-one', { rotate: 360, duration: 38, ease: 'none', repeat: -1, paused: true }),
        gsap.to('.wave-orbit-two', { rotate: -360, duration: 46, ease: 'none', repeat: -1, paused: true }),
      ];
      let active = false;
      const sync = () => motions.forEach(motion => motion.paused(!active || document.hidden));
      this.waveVisibilityHandler = sync;
      document.addEventListener('visibilitychange', sync);
      const trigger = ScrollTrigger.create({
        trigger: this.element, start: 'top bottom', end: 'bottom top',
        onToggle: self => { active = self.isActive; sync(); },
      });
      active = trigger.isActive;
      sync();
    }, this.element);
  }

  ngOnDestroy(): void {
    if (this.waveVisibilityHandler) document.removeEventListener('visibilitychange', this.waveVisibilityHandler);
    this.waveAnimation?.revert();
  }
}
