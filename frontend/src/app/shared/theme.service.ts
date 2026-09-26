import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'vakeva.theme';

/**
 * Modo oscuro del panel y del admin. Solo se aplica mientras el usuario está dentro de uno de esos
 * dos layouts (attach/detach): la landing y las pantallas de acceso siempre se ven en claro.
 * La preferencia se guarda en el navegador y se comparte entre panel y admin.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  // Cuántos layouts (panel/admin) están en pantalla; al pasar de uno a otro se solapan un instante.
  private attachedCount = 0;

  readonly mode = signal<ThemeMode>(this.readStored());
  readonly isDark = computed(() => this.mode() === 'dark');

  constructor() {
    effect(() => {
      const mode = this.mode();
      this.persist(mode);
      if (this.attachedCount > 0) {
        this.apply(mode);
      }
    });
  }

  /** El layout del panel/admin avisa que está en pantalla para que el tema se pinte. */
  attach(): void {
    this.attachedCount++;
    this.apply(this.mode());
  }

  /** Al salir del panel/admin se quita el atributo y el resto del sitio queda en claro. */
  detach(): void {
    this.attachedCount = Math.max(0, this.attachedCount - 1);
    if (this.attachedCount === 0) {
      this.document.documentElement.classList.remove('dark');
      this.setThemeColor(null);
    }
  }

  toggle(): void {
    this.mode.update((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  private apply(mode: ThemeMode): void {
    const root = this.document.documentElement;
    root.classList.toggle('dark', mode === 'dark');
    this.setThemeColor(mode === 'dark' ? '#04100e' : null);
  }

  private setThemeColor(color: string | null): void {
    const meta = this.document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      return;
    }
    if (!meta.hasAttribute('data-light')) {
      meta.setAttribute('data-light', meta.getAttribute('content') ?? '');
    }
    meta.setAttribute('content', color ?? meta.getAttribute('data-light') ?? '');
  }

  private readStored(): ThemeMode {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  private persist(mode: ThemeMode): void {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Sin almacenamiento (modo privado o bloqueado): el tema dura solo esta sesión.
    }
  }
}
