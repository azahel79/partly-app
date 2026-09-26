import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/reveal.directive';
import { Footer } from '../components/footer/footer';
import { Navbar, NavLink } from '../components/navbar/navbar';

const NAV_LINKS: NavLink[] = [
  { label: 'Resumen', routerLink: '/seguridad', fragment: 'resumen', active: true },
  { label: 'Credenciales', routerLink: '/seguridad', fragment: 'credenciales' },
  { label: 'Protección', routerLink: '/seguridad', fragment: 'proteccion' },
  { label: 'Preguntas', routerLink: '/seguridad', fragment: 'preguntas' },
];

@Component({
  selector: 'app-seguridad',
  imports: [RouterLink, RevealDirective, Footer, Navbar],
  templateUrl: './seguridad.html',
  styleUrl: './seguridad.css',
})
export class Seguridad {
  protected readonly navLinks = NAV_LINKS;
}
