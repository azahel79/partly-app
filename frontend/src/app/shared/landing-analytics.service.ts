import { Injectable } from '@angular/core';

export type LandingAnalyticsValue = string | number | boolean;
export type LandingAnalyticsParams = Record<string, LandingAnalyticsValue>;

interface AnalyticsWindow extends Window {
  dataLayer?: Array<Record<string, unknown>>;
  gtag?: (command: 'event', eventName: string, params?: LandingAnalyticsParams) => void;
}

/**
 * Capa neutral de analítica para las páginas públicas.
 * No carga cookies ni transmite información por sí sola: publica eventos sin PII
 * para que producción pueda conectarlos a GA4, Matomo u otro proveedor aprobado.
 */
@Injectable({ providedIn: 'root' })
export class LandingAnalyticsService {
  track(eventName: string, params: LandingAnalyticsParams = {}): void {
    if (typeof window === 'undefined') {
      return;
    }

    const analyticsWindow = window as AnalyticsWindow;
    const payload = { ...params, page_path: window.location.pathname };

    if (analyticsWindow.gtag) {
      analyticsWindow.gtag('event', eventName, payload);
    } else {
      analyticsWindow.dataLayer ??= [];
      analyticsWindow.dataLayer.push({ event: eventName, ...payload });
    }

    window.dispatchEvent(new CustomEvent('partly:analytics', { detail: { eventName, params: payload } }));
  }
}
