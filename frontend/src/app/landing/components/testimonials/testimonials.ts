import { Component } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';
import { TiltDirective } from '../../../shared/tilt.directive';

@Component({
  imports: [RevealDirective, TiltDirective],
  selector: 'app-testimonials',
  styleUrl: './testimonials.css',
  templateUrl: './testimonials.html',
})
export class Testimonials {}
