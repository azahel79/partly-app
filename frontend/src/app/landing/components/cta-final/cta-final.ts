import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../../shared/reveal.directive';
import { MagneticDirective } from '../../../shared/magnetic.directive';
import { TrackEventDirective } from '../../../shared/track-event.directive';

@Component({
  imports: [RevealDirective, MagneticDirective, RouterLink, TrackEventDirective],
  selector: 'app-cta-final',
  styleUrl: './cta-final.css',
  templateUrl: './cta-final.html',
})
export class CtaFinal {}
