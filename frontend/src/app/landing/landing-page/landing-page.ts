import { Component } from '@angular/core';
import { Navbar } from '../components/navbar/navbar';
import { Hero } from '../components/hero/hero';
import { LandingMotionDirective } from './landing-motion.directive';
import { LandingContent } from './landing-content';

@Component({
  imports: [
    LandingMotionDirective,
    Navbar,
    Hero,
    LandingContent,
  ],
  selector: 'app-landing-page',
  styleUrl: './landing-page.css',
  templateUrl: './landing-page.html',
})
export class LandingPage {}
