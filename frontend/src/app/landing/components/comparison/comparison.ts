import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../../shared/reveal.directive';
import { TiltDirective } from '../../../shared/tilt.directive';

@Component({
  imports: [RevealDirective, TiltDirective, RouterLink],
  selector: 'app-comparison',
  styleUrl: './comparison.css',
  templateUrl: './comparison.html',
})
export class Comparison {}
