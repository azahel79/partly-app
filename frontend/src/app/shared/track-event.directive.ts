import { Directive, HostListener, Input, inject } from '@angular/core';
import { LandingAnalyticsParams, LandingAnalyticsService } from './landing-analytics.service';

@Directive({ selector: '[appTrackEvent]' })
export class TrackEventDirective {
  private readonly analytics = inject(LandingAnalyticsService);

  @Input({ required: true }) appTrackEvent = '';
  @Input() trackEventParams: LandingAnalyticsParams = {};

  @HostListener('click')
  protected trackClick(): void {
    if (this.appTrackEvent) {
      this.analytics.track(this.appTrackEvent, this.trackEventParams);
    }
  }
}
