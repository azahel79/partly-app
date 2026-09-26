import { Component, computed, input, signal } from '@angular/core';
import { platformLogoSrc } from '../platform-logo.util';

/**
 * Cuadro con el logo de una plataforma. Usa el logo real si lo reconoce por el nombre (o si la
 * plataforma trae un logoUrl); si no, cae a la inicial sobre un verde genérico. El tamaño, las
 * esquinas y las animaciones los pone quien lo usa con clases sobre <app-platform-logo>.
 */
@Component({
  selector: 'app-platform-logo',
  host: { class: 'block overflow-hidden' },
  template: `
    @if (src(); as url) {
      <img [src]="url" [alt]="name()" class="w-full h-full object-cover block" (error)="markBroken(url)" />
    } @else {
      <span class="w-full h-full flex items-center justify-center" [class]="fallbackClass">{{ initial() }}</span>
    }
  `,
})
export class PlatformLogo {
  readonly name = input.required<string>();
  readonly logoUrl = input<string | null | undefined>(null);

  private readonly broken = signal<ReadonlySet<string>>(new Set());

  protected readonly src = computed(() => {
    const candidates = [platformLogoSrc(this.name()), this.logoUrl()];
    return candidates.find((url): url is string => !!url && !this.broken().has(url)) ?? null;
  });

  protected readonly initial = computed(() => (this.name().trim().charAt(0) || '?').toUpperCase());

  /** Las plataformas que no se reconocen comparten un mismo tile genérico (verde de la marca). */
  protected readonly fallbackClass = 'bg-linear-to-br from-emerald-500 to-teal-600 text-white';

  protected markBroken(url: string): void {
    this.broken.update((set) => new Set(set).add(url));
  }
}
