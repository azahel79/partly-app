import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ParallaxDirective } from '../../../shared/parallax.directive';
import { MagneticDirective } from '../../../shared/magnetic.directive';
import { TrackEventDirective } from '../../../shared/track-event.directive';

@Component({
  imports: [ParallaxDirective, MagneticDirective, RouterLink, TrackEventDirective],
  selector: 'app-hero',
  styleUrl: './hero.css',
  templateUrl: './hero.html',
})
export class Hero {}
