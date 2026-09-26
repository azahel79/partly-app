import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../../shared/reveal.directive';

type ProductView = 'explore' | 'join' | 'manage';

interface ProductViewOption {
  id: ProductView;
  eyebrow: string;
  title: string;
  description: string;
  icon: string;
}

@Component({
  imports: [RevealDirective, RouterLink],
  selector: 'app-product-tour',
  styleUrl: './product-tour.css',
  templateUrl: './product-tour.html',
})
export class ProductTour {
  protected readonly activeView = signal<ProductView>('explore');
  protected readonly isPlaying = signal(false);
  protected readonly views: ProductViewOption[] = [
    {
      id: 'explore',
      eyebrow: '01 · Encuentra',
      title: 'Explora grupos',
      description: 'Compara precios, cupos y anfitriones antes de elegir.',
      icon: 'travel_explore',
    },
    {
      id: 'join',
      eyebrow: '02 · Decide',
      title: 'Revisa tu parte',
      description: 'Conoce cuánto pagarás y qué incluye el cupo.',
      icon: 'receipt_long',
    },
    {
      id: 'manage',
      eyebrow: '03 · Controla',
      title: 'Administra el ciclo',
      description: 'Pagos, miembros y próximas fechas en un solo lugar.',
      icon: 'space_dashboard',
    },
  ];

  private readonly destroyRef = inject(DestroyRef);
  private guideTimer: number | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopGuide());
  }

  protected selectView(view: ProductView): void {
    this.stopGuide();
    this.activeView.set(view);
  }

  protected toggleGuide(): void {
    if (this.isPlaying()) {
      this.stopGuide();
      return;
    }

    this.isPlaying.set(true);
    this.activeView.set('explore');
    this.scheduleStep(1);
  }

  private scheduleStep(index: number): void {
    this.guideTimer = window.setTimeout(() => {
      this.activeView.set(this.views[index].id);
      if (index < this.views.length - 1) {
        this.scheduleStep(index + 1);
      } else {
        this.guideTimer = window.setTimeout(() => this.isPlaying.set(false), 3200);
      }
    }, 3200);
  }

  private stopGuide(): void {
    if (this.guideTimer !== null) {
      window.clearTimeout(this.guideTimer);
      this.guideTimer = null;
    }
    this.isPlaying.set(false);
  }
}
