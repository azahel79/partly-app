import { Component } from '@angular/core';
import { WaveDivider } from '../../shared/wave-divider';
import { CtaFinal } from '../components/cta-final/cta-final';
import { AudiencePaths } from '../components/audience-paths/audience-paths';
import { HowItWorks } from '../components/how-it-works/how-it-works';
import { Owners } from '../components/owners/owners';
import { Platforms } from '../components/platforms/platforms';
import { ProductTour } from '../components/product-tour/product-tour';
import { PaymentJourney } from '../components/payment-journey/payment-journey';
import { SavingsCalculator } from '../components/savings-calculator/savings-calculator';
import { Security } from '../components/security/security';
import { Testimonials } from '../components/testimonials/testimonials';
import { LandingMotionDirective } from './landing-motion.directive';

/** Loaded when the visitor approaches the end of the hero. */
@Component({
  selector: 'app-landing-content',
  imports: [
    LandingMotionDirective,
    AudiencePaths,
    HowItWorks,
    ProductTour,
    PaymentJourney,
    SavingsCalculator,
    Platforms,
    Security,
    Owners,
    Testimonials,
    CtaFinal,
    WaveDivider,
  ],
  templateUrl: './landing-content.html',
  styleUrl: './landing-content.css',
})
export class LandingContent {}
