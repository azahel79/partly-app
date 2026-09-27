import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/reveal.directive';
import { WaveDivider } from '../../shared/wave-divider';

@Component({
  selector: 'app-terminos',
  imports: [RouterLink, RevealDirective, WaveDivider],
  templateUrl: './terminos.html',
  styleUrl: './terminos.css',
})
export class Terminos {
  protected readonly lastUpdated = '20 de septiembre de 2026';
}
