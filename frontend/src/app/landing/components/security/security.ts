import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../../shared/reveal.directive';

@Component({
  imports: [RevealDirective, RouterLink],
  selector: 'app-security',
  styleUrl: './security.css',
  templateUrl: './security.html',
})
export class Security {}
