import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/reveal.directive';
import { WaveDivider } from '../../shared/wave-divider';
import { Footer } from '../components/footer/footer';
import { Navbar, NavLink } from '../components/navbar/navbar';

const NAV_LINKS: NavLink[] = [
  { label: 'Tus datos', routerLink: '/privacidad', fragment: 'datos', active: true },
  { label: 'Derechos ARCO', routerLink: '/privacidad', fragment: 'arco' },
  { label: 'Seguridad', routerLink: '/seguridad' },
  { label: 'Términos', routerLink: '/terminos' },
];

@Component({
  selector: 'app-privacidad',
  imports: [RouterLink, RevealDirective, WaveDivider, Footer, Navbar],
  templateUrl: './privacidad.html',
  styleUrl: './privacidad.css',
})
export class Privacidad {
  protected readonly navLinks = NAV_LINKS;
  protected readonly lastUpdated = '20 de septiembre de 2026';
}
