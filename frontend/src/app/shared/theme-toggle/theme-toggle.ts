import { Component, inject } from '@angular/core';
import { ThemeService } from '../theme.service';

/** Interruptor de modo claro / oscuro para el encabezado del panel y del admin. */
@Component({
  selector: 'app-theme-toggle',
  template: `
    <button
      type="button"
      class="theme-switch"
      role="switch"
      [attr.aria-checked]="theme.isDark()"
      [attr.aria-label]="theme.isDark() ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
      [attr.title]="theme.isDark() ? 'Modo oscuro activado' : 'Modo oscuro'"
      [class.is-dark]="theme.isDark()"
      (click)="theme.toggle()"
    >
      <span class="material-symbols-outlined track-icon sun">light_mode</span>
      <span class="material-symbols-outlined track-icon moon">dark_mode</span>
      <span class="knob">
        <span class="material-symbols-outlined">{{ theme.isDark() ? 'dark_mode' : 'light_mode' }}</span>
      </span>
    </button>
  `,
  styles: `
    :host { display: inline-flex; flex-shrink: 0; }
    .theme-switch { position: relative; width: 58px; height: 32px; padding: 0; border: 1px solid #dfe5ea; border-radius: 999px; background: #eef2f5; cursor: pointer; transition: background-color .25s ease, border-color .25s ease, box-shadow .25s ease; }
    .theme-switch:hover { border-color: #c9d2da; }
    .track-icon { position: absolute; top: 50%; translate: 0 -50%; font-size: 16px; color: #8a96a3; transition: opacity .2s ease; }
    .track-icon.sun { left: 8px; }
    .track-icon.moon { right: 8px; }
    .knob { position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; background: #fff; color: #d97706; box-shadow: 0 2px 6px rgba(15, 23, 42, .22); transition: transform .28s cubic-bezier(.34, 1.4, .64, 1), background-color .25s ease, color .25s ease; }
    .knob .material-symbols-outlined { font-size: 15px; font-variation-settings: 'FILL' 1; }
    .is-dark { background: #0d2a23; border-color: rgba(52, 211, 153, .45); box-shadow: 0 0 16px -4px rgba(52, 211, 153, .5); }
    .is-dark .knob { transform: translateX(26px); background: #34d399; color: #04241b; box-shadow: 0 2px 8px rgba(0, 0, 0, .4); }
    .is-dark .track-icon { color: #6f8f86; }
    .theme-switch:not(.is-dark) .track-icon.sun, .is-dark .track-icon.moon { opacity: 0; }
    .theme-switch:focus-visible { outline: 2px solid #059669; outline-offset: 3px; }
    @media (prefers-reduced-motion: reduce) { .knob, .theme-switch { transition: none; } }
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
}
