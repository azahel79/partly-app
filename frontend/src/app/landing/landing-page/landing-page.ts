import { Component } from '@angular/core';
import { Hero } from '../components/hero/hero';
import { LandingMotionDirective } from './landing-motion.directive';
import { LandingContent } from './landing-content';

@Component({
  imports: [
    LandingMotionDirective,
    Hero,
    LandingContent,
  ],
  selector: 'app-landing-page',
  styleUrl: './landing-page.css',
  templateUrl: './landing-page.html',
})
export class LandingPage {}
