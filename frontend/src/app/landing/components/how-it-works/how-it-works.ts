import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../../shared/reveal.directive';

@Component({
  imports: [RevealDirective, RouterLink],
  selector: 'app-how-it-works',
  styleUrl: './how-it-works.css',
  templateUrl: './how-it-works.html',
})
export class HowItWorks {}
