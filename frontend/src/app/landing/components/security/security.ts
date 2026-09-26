import { Component } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';

@Component({
  imports: [RevealDirective],
  selector: 'app-security',
  styleUrl: './security.css',
  templateUrl: './security.html',
})
export class Security {}
