import { Directive, ElementRef, HostListener, Input, OnInit, inject } from '@angular/core';
import { gsap, prefersReducedMotion } from './gsap';

/**
 * 3D tilt-on-hover, cursor-tracked. Uses `gsap.quickTo` for each axis, which
 * gives the tilt a light spring/inertia instead of snapping straight to the
 * cursor position on every mousemove — much smoother under fast movement
 * than writing the `transform` string directly.
 */
@Directive({
  selector: '[appTilt]',
  standalone: true,
  host: {
    '[style.transform-style]': "'preserve-3d'",
  },
})
export class TiltDirective implements OnInit {
  private readonly el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  @Input() appTiltStrength = 10;

  private rotateX: gsap.QuickToFunc | null = null;
  private rotateY: gsap.QuickToFunc | null = null;
  private disabled = false;

  ngOnInit(): void {
    this.disabled = typeof window === 'undefined' || prefersReducedMotion();
    if (this.disabled) return;

    gsap.set(this.el, { transformPerspective: 700, z: 0 });
    this.rotateX = gsap.quickTo(this.el, 'rotationX', { duration: 0.4, ease: 'power3.out' });
    this.rotateY = gsap.quickTo(this.el, 'rotationY', { duration: 0.4, ease: 'power3.out' });
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.disabled) return;
    const rect = this.el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    this.rotateY?.(x * this.appTiltStrength);
    this.rotateX?.(-y * this.appTiltStrength);
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    if (this.disabled) return;
    this.rotateX?.(0);
    this.rotateY?.(0);
  }
}
