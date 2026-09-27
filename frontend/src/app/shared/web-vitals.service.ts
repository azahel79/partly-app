import { Injectable, inject } from '@angular/core';
import { LandingAnalyticsService } from './landing-analytics.service';

interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

@Injectable({ providedIn: 'root' })
export class WebVitalsService {
  private readonly analytics = inject(LandingAnalyticsService);
  private started = false;
  private clsValue = 0;
  private lcpValue = 0;
  private inpValue = 0;

  start(): void {
    if (this.started || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
      return;
    }
    this.started = true;

    const supported = PerformanceObserver.supportedEntryTypes ?? [];
    if (supported.includes('largest-contentful-paint')) {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        this.lcpValue = entries.at(-1)?.startTime ?? this.lcpValue;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    }

    if (supported.includes('layout-shift')) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as LayoutShiftEntry[]) {
          if (!entry.hadRecentInput) {
            this.clsValue += entry.value;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    }

    if (supported.includes('event')) {
      // durationThreshold es parte de Event Timing pero aún no está en los tipos DOM de TypeScript.
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.inpValue = Math.max(this.inpValue, entry.duration);
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 40 } as PerformanceObserverInit);
    }

    window.addEventListener('pagehide', () => this.report(), { once: true });
  }

  private report(): void {
    if (this.lcpValue > 0) {
      this.analytics.track('web_vital', { metric: 'LCP', value: Math.round(this.lcpValue) });
    }
    this.analytics.track('web_vital', { metric: 'CLS', value: Number(this.clsValue.toFixed(4)) });
    if (this.inpValue > 0) {
      this.analytics.track('web_vital', { metric: 'INP', value: Math.round(this.inpValue) });
    }
  }
}
