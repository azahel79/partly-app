import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/reveal.directive';
import { WaveDivider } from '../../shared/wave-divider';

@Component({
  selector: 'app-privacidad',
  imports: [RouterLink, RevealDirective, WaveDivider],
  templateUrl: './privacidad.html',
  styleUrl: './privacidad.css',
})
export class Privacidad {
  protected readonly lastUpdated = '20 de septiembre de 2026';
}
