import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/reveal.directive';

@Component({
  selector: 'app-seguridad',
  imports: [RouterLink, RevealDirective],
  templateUrl: './seguridad.html',
  styleUrl: './seguridad.css',
})
export class Seguridad {}
