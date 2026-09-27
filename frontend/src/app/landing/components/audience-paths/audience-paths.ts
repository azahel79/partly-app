import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../../shared/reveal.directive';
import { LandingAnalyticsService } from '../../../shared/landing-analytics.service';
import { TrackEventDirective } from '../../../shared/track-event.directive';

type Audience = 'buyer' | 'owner';

@Component({
  selector: 'app-audience-paths',
  imports: [RouterLink, RevealDirective, TrackEventDirective],
  templateUrl: './audience-paths.html',
  styleUrl: './audience-paths.css',
})
export class AudiencePaths {
  private readonly analytics = inject(LandingAnalyticsService);
  protected readonly audience = signal<Audience>('buyer');

  protected selectAudience(audience: Audience): void {
    this.audience.set(audience);
    this.analytics.track('landing_audience_selected', { audience });
  }
}
