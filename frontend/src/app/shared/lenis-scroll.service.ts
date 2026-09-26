import { Injectable } from '@angular/core';
import type Lenis from 'lenis';

const RETRY_INTERVAL_MS = 100;
const MAX_RETRIES = 15; // ~1.5s — tiempo de sobra para que un @defer(on idle) termine de renderizar

/**
 * La landing usa Lenis para el scroll con inercia (ver landing-effects.ts). Si saltamos a un
 * ancla con `element.scrollIntoView()` o `window.scrollTo()` directo, la posición nativa cambia
 * pero Lenis no se entera — su siguiente frame "corrige" la posición hacia donde él cree que
 * debería estar, lo que se ve como un salto brusco. Este servicio centraliza el scroll a un
 * fragmento: si hay una instancia de Lenis activa, la usa (scroll suave real); si no (mobile,
 * u otra página sin el motor de la landing), cae a `scrollIntoView` nativo con `behavior: smooth`.
 */
@Injectable({ providedIn: 'root' })
export class LenisScrollService {
  private instance: Lenis | null = null;

  register(lenis: Lenis): void {
    this.instance = lenis;
  }

  unregister(lenis: Lenis): void {
    if (this.instance === lenis) {
      this.instance = null;
    }
  }

  /**
   * Reintenta un rato por si el elemento todavía no existe (secciones con @defer). El primer
   * intento se difiere con un setTimeout aunque el elemento ya exista: `scrollPositionRestoration`
   * de Angular hace su propio scroll-a-(0,0) de forma síncrona en la misma navegación, y si
   * corremos en el mismo tick, esa reubicación gana la carrera y cancela la nuestra.
   */
  scrollToId(id: string, attempt = 0): void {
    setTimeout(() => this.attemptScroll(id, attempt), attempt === 0 ? 50 : RETRY_INTERVAL_MS);
  }

  private attemptScroll(id: string, attempt: number): void {
    const target = document.getElementById(id);
    if (!target) {
      if (attempt < MAX_RETRIES) {
        this.scrollToId(id, attempt + 1);
      }
      return;
    }

    if (this.instance) {
      this.instance.scrollTo(target, { offset: -96, duration: 1.4 });
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
