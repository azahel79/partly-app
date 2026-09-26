import { Component } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';
import { TiltDirective } from '../../../shared/tilt.directive';

@Component({
  imports: [RevealDirective, TiltDirective],
  selector: 'app-benefits',
  styleUrl: './benefits.css',
  templateUrl: './benefits.html',
})
export class Benefits {}
