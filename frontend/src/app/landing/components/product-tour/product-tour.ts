import { Component, signal } from '@angular/core';
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

  protected selectView(view: ProductView): void {
    this.activeView.set(view);
  }
}
