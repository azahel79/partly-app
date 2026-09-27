import { Directive, ElementRef, HostListener, Input, OnDestroy, OnInit, inject } from '@angular/core';

/** A lightweight magnetic hover that does not pull GSAP into the critical bundle. */
@Directive({
  selector: '[appMagnetic]',
  standalone: true,
})
export class MagneticDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef).nativeElement as HTMLElement;

  @Input() appMagneticStrength = 0.4;

  private label: HTMLElement | null = null;
  private disabled = false;
  private frame = 0;
  private targetX = 0;
  private targetY = 0;

  ngOnInit(): void {
    this.disabled = typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.disabled) return;
    this.label = this.el.querySelector<HTMLElement>('.magnetic-label');
    this.el.style.willChange = 'translate';
    if (this.label) this.label.style.willChange = 'translate';
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.disabled) return;
    const rect = this.el.getBoundingClientRect();
    this.targetX = (event.clientX - (rect.left + rect.width / 2)) * this.appMagneticStrength;
    this.targetY = (event.clientY - (rect.top + rect.height / 2)) * this.appMagneticStrength;
    this.scheduleUpdate();
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    if (this.disabled) return;
    this.targetX = 0;
    this.targetY = 0;
    this.scheduleUpdate();
  }

  ngOnDestroy(): void {
    if (typeof window === 'undefined') return;
    cancelAnimationFrame(this.frame);
    this.el.style.removeProperty('translate');
    this.el.style.removeProperty('transition');
    this.el.style.removeProperty('will-change');
    this.label?.style.removeProperty('translate');
    this.label?.style.removeProperty('transition');
    this.label?.style.removeProperty('will-change');
  }

  private scheduleUpdate(): void {
    if (typeof window === 'undefined') return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.el.style.transition = 'translate 480ms cubic-bezier(.2,.8,.2,1)';
      this.el.style.translate = `${this.targetX}px ${this.targetY}px`;
      if (this.label) {
        this.label.style.transition = 'translate 520ms cubic-bezier(.2,.8,.2,1)';
        this.label.style.translate = `${this.targetX * 0.6}px ${this.targetY * 0.6}px`;
      }
    });
  }
}
