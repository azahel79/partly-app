import { afterEach, describe, expect, it, vi } from 'vitest';
import { LandingAnalyticsService } from './landing-analytics.service';

interface AnalyticsTestWindow extends Window {
  dataLayer?: Array<Record<string, unknown>>;
  gtag?: ReturnType<typeof vi.fn>;
}

describe('LandingAnalyticsService', () => {
  const analyticsWindow = window as AnalyticsTestWindow;

  afterEach(() => {
    delete analyticsWindow.dataLayer;
    delete analyticsWindow.gtag;
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('queues a privacy-safe event when no provider is installed', () => {
    window.history.replaceState({}, '', '/seguridad');
    new LandingAnalyticsService().track('public_cta_clicked', { placement: 'hero' });

    expect(analyticsWindow.dataLayer).toEqual([
      { event: 'public_cta_clicked', placement: 'hero', page_path: '/seguridad' },
    ]);
  });

  it('uses an existing gtag provider without duplicating the dataLayer event', () => {
    analyticsWindow.gtag = vi.fn();
    new LandingAnalyticsService().track('public_page_view', { route: '/' });

    expect(analyticsWindow.gtag).toHaveBeenCalledWith('event', 'public_page_view', {
      route: '/',
      page_path: '/',
    });
    expect(analyticsWindow.dataLayer).toBeUndefined();
  });

  it('exposes the event locally for provider adapters and QA', () => {
    const listener = vi.fn();
    window.addEventListener('partly:analytics', listener);
    new LandingAnalyticsService().track('landing_audience_selected', { audience: 'buyer' });

    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
      eventName: 'landing_audience_selected',
      params: { audience: 'buyer', page_path: '/' },
    });
    window.removeEventListener('partly:analytics', listener);
  });
});
