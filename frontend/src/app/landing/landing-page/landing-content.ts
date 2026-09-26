import { Component } from '@angular/core';
import { WaveDivider } from '../../shared/wave-divider';
import { Comparison } from '../components/comparison/comparison';
import { CtaFinal } from '../components/cta-final/cta-final';
import { Footer } from '../components/footer/footer';
import { HowItWorks } from '../components/how-it-works/how-it-works';
import { MetricsBanner } from '../components/metrics-banner/metrics-banner';
import { Owners } from '../components/owners/owners';
import { Platforms } from '../components/platforms/platforms';
import { Security } from '../components/security/security';
import { Testimonials } from '../components/testimonials/testimonials';
import { LandingMotionDirective } from './landing-motion.directive';

/** Loaded when the visitor approaches the end of the hero. */
@Component({
  selector: 'app-landing-content',
  imports: [
    LandingMotionDirective,
    MetricsBanner,
    HowItWorks,
    Comparison,
    Platforms,
    Security,
    Owners,
    Testimonials,
    CtaFinal,
    Footer,
    WaveDivider,
  ],
  templateUrl: './landing-content.html',
  styleUrl: './landing-content.css',
})
export class LandingContent {}
