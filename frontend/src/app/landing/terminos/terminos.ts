import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/reveal.directive';
import { WaveDivider } from '../../shared/wave-divider';
import { Footer } from '../components/footer/footer';
import { Navbar, NavLink } from '../components/navbar/navbar';

const NAV_LINKS: NavLink[] = [
  { label: 'El servicio', routerLink: '/terminos', fragment: 'servicio', active: true },
  { label: 'Pagos y grupos', routerLink: '/terminos', fragment: 'pagos' },
  { label: 'Cuentas', routerLink: '/terminos', fragment: 'cuentas' },
  { label: 'Privacidad', routerLink: '/privacidad' },
];

@Component({
  selector: 'app-terminos',
  imports: [RouterLink, RevealDirective, WaveDivider, Footer, Navbar],
  templateUrl: './terminos.html',
  styleUrl: './terminos.css',
})
export class Terminos {
  protected readonly navLinks = NAV_LINKS;
  protected readonly lastUpdated = '20 de septiembre de 2026';
}
