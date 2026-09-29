import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, OnDestroy, afterNextRender, inject, input, output } from '@angular/core';
import { ConfirmService } from '../confirm.service';

let nextId = 0;

/**
 * Modal para acciones con formulario o una decisión importante (entregar credenciales, revisar un pago…). Las
 * confirmaciones simples de "¿Seguro?" siguen con ConfirmService.
 *
 * Se cierra con Esc, con la X o tocando fuera; si ya se escribió algo (`dirty`) pregunta antes de descartar, y
 * mientras guarda (`busy`) no se deja cerrar. En celular se abre como hoja desde abajo. Los botones van en un
 * elemento con el atributo `modal-actions`; para cancelar desde ahí se llama a `close()` con una referencia al modal.
 */
@Component({
  selector: 'app-ui-modal',
  template: `
    <div class="ui-modal-backdrop" (mousedown)="onBackdropPress($event)" (click)="onBackdropClick($event)">
      <section class="ui-modal" role="dialog" aria-modal="true" [attr.aria-labelledby]="titleId" tabindex="-1">
        <header class="ui-modal__head">
          <div class="ui-modal__heading">
            <h2 class="ui-modal__title" [id]="titleId">{{ title() }}</h2>
            @if (subtitle()) {
              <p class="ui-modal__subtitle">{{ subtitle() }}</p>
            }
          </div>
          <button type="button" class="ui-modal__close" aria-label="Cerrar" [disabled]="busy()" (click)="close()">
            <span class="material-symbols-outlined">close</span>
          </button>
        </header>
        <div class="ui-modal__body"><ng-content /></div>
        <footer class="ui-modal__foot"><ng-content select="[modal-actions]" /></footer>
      </section>
    </div>
  `,
  host: { '(document:keydown.escape)': 'close()', '[class.ui-modal--wide]': 'wide()' },
})
export class UiModal implements OnDestroy {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  /** Hay algo escrito que se perdería al cerrar. */
  readonly dirty = input(false);
  /** Guardando: no se puede cerrar. */
  readonly busy = input(false);
  /** Más ancho, para contenido con vista previa (ej. un comprobante). */
  readonly wide = input(false);
  readonly closed = output<void>();

  protected readonly titleId = `ui-modal-title-${++nextId}`;
  protected pressedOutside = false;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly confirmService = inject(ConfirmService);
  private readonly previousFocus = this.document.activeElement as HTMLElement | null;
  private asking = false;

  constructor() {
    this.document.body.style.overflow = 'hidden';
    afterNextRender(() => {
      const root = this.host.nativeElement;
      const first = root.querySelector<HTMLElement>('.ui-modal__body :is(input, select, textarea):not([disabled])');
      (first ?? root.querySelector<HTMLElement>('.ui-modal'))?.focus();
    });
  }

  ngOnDestroy(): void {
    this.document.body.style.overflow = '';
    this.previousFocus?.focus?.();
  }

  /** Cierra respetando `busy` y `dirty` (pregunta antes de descartar lo escrito). */
  async close(): Promise<void> {
    if (this.busy() || this.asking) {
      return;
    }
    if (this.dirty()) {
      this.asking = true;
      const discard = await this.confirmService.ask({
        title: '¿Descartar lo que escribiste?',
        text: 'Si cierras ahora se pierde lo que llenaste.',
        confirmText: 'Sí, descartar',
        cancelText: 'Seguir editando',
        danger: true,
      });
      this.asking = false;
      if (!discard) {
        return;
      }
    }
    this.closed.emit();
  }

  /**
   * Método y no una asignación en la plantilla: si el manejador devuelve `false`, Angular cancela la acción del
   * navegador, y en un mousedown eso impide poner el cursor en los campos del modal.
   */
  protected onBackdropPress(event: MouseEvent): void {
    this.pressedOutside = event.target === event.currentTarget;
  }

  protected onBackdropClick(event: MouseEvent): void {
    // Solo si el clic empezó y terminó fuera: arrastrar al seleccionar texto no debe cerrar el modal.
    if (event.target === event.currentTarget && this.pressedOutside) {
      this.close();
    }
    this.pressedOutside = false;
  }
}
