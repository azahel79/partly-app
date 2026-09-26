import { Component, DestroyRef, HostListener, Input, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../shared/auth.service';
import { MagneticDirective } from '../../../shared/magnetic.directive';
import { LenisScrollService } from '../../../shared/lenis-scroll.service';

export interface NavLink {
  label: string;
  routerLink: string;
  fragment?: string;
  active?: boolean;
  /** Nombre del ícono de Material Symbols. Opcional: las páginas legales reusan este componente sin íconos. */
  icon?: string;
}

const DEFAULT_LINKS: NavLink[] = [
  { label: 'Cómo funciona', routerLink: '/', fragment: 'como-funciona', active: true, icon: 'home' },
  { label: 'Explorar', routerLink: '/', fragment: 'plataformas', icon: 'explore' },
  { label: 'Compara tu plan', routerLink: '/', fragment: 'owners', icon: 'group' },
  { label: 'Precios', routerLink: '/', fragment: 'comparativa', icon: 'credit_card' },
];

@Component({
  imports: [RouterLink, MagneticDirective],
  selector: 'app-navbar',
  styleUrl: './navbar.css',
  templateUrl: './navbar.html',
})
export class Navbar implements OnInit {
  /** Cada página pasa sus propios enlaces (misma barra, misma navegación, distinto destino). */
  @Input() links: NavLink[] = DEFAULT_LINKS;

  protected readonly authService = inject(AuthService);
  protected readonly mobileMenuOpen = signal(false);
  protected readonly showBackToTop = signal(false);
  protected readonly socialMenuOpen = signal(false);
  protected readonly socialNotice = signal('');

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly scrollService = inject(LenisScrollService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    // Centralizado aquí (no en cada página) porque el navbar es el único componente presente en
    // las 5 páginas que usan enlaces con fragmento (landing, seguridad, privacidad, términos,
    // comparativa) — cubre tanto llegar ya con "#seccion" en la URL como hacer click estando en
    // la misma página (gracias a onSameUrlNavigation: 'reload' en app.config.ts).
    const sub = this.route.fragment.subscribe((fragment) => {
      if (fragment) {
        this.scrollService.scrollToId(fragment);
      }
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  protected showSocialNotice(network: string): void {
    this.socialNotice.set(network + ': enlace pendiente de configurar.');
  }

  @HostListener('document:keydown.escape')
  protected closeSocialMenu(): void {
    this.mobileMenuOpen.set(false);
    this.socialMenuOpen.set(false);
    this.socialNotice.set('');
  }

  @HostListener('window:scroll')
  protected onWindowScroll(): void {
    this.showBackToTop.set(window.scrollY > 500);
  }

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  /** El navbar de la landing siempre muestra "Iniciar sesión"/"Crear cuenta"; si el usuario ya
   * está autenticado, lo mandamos directo a su panel en vez de al formulario. */
  protected goToAuth(target: 'login' | 'register'): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/panel']);
      return;
    }
    this.router.navigate([target === 'login' ? '/iniciar-sesion' : '/crear-cuenta']);
  }

  protected scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
