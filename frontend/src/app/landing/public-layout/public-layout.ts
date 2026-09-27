import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { Footer } from '../components/footer/footer';
import { Navbar, NavLink } from '../components/navbar/navbar';
import { LandingAnalyticsService } from '../../shared/landing-analytics.service';
import { WebVitalsService } from '../../shared/web-vitals.service';

const PUBLIC_LINKS: Omit<NavLink, 'active'>[] = [
  { label: 'Inicio', routerLink: '/', icon: 'home' },
  { label: 'Cómo funciona', routerLink: '/como-funciona-el-ciclo', icon: 'route' },
  { label: 'Comparativa', routerLink: '/comparativa', icon: 'compare_arrows' },
  { label: 'Seguridad', routerLink: '/seguridad', icon: 'verified_user' },
];

const PUBLIC_SEO: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'Partly — Comparte suscripciones y paga solo tu parte',
    description: 'Explora grupos, conoce el monto antes de transferir y administra comprobantes y accesos compartidos desde Partly México.',
  },
  '/como-funciona-el-ciclo': {
    title: 'Cómo funcionan los pagos y accesos | Partly',
    description: 'Conoce el ciclo completo de Partly: cálculo proporcional, transferencia, comprobante, revisión del titular, renovación y acceso.',
  },
  '/comparativa': {
    title: 'Comparativa de planes y precios | Partly',
    description: 'Compara el precio completo de planes activos con el costo estimado por cupo usando información disponible en Partly.',
  },
  '/seguridad': {
    title: 'Seguridad, comprobantes y credenciales | Partly',
    description: 'Consulta cómo Partly protege credenciales, registra comprobantes, controla el acceso y conserva el historial de incidencias.',
  },
  '/terminos': {
    title: 'Términos de servicio | Partly',
    description: 'Consulta las reglas de Partly para cuentas, grupos, pagos, credenciales, comisiones, cancelaciones e incidencias.',
  },
  '/privacidad': {
    title: 'Privacidad y derechos ARCO | Partly',
    description: 'Conoce qué datos trata Partly, cómo los protege y cómo ejercer tus derechos de acceso, rectificación, cancelación y oposición.',
  },
};

@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet, Navbar, Footer],
  templateUrl: './public-layout.html',
  styleUrl: './public-layout.css',
})
export class PublicLayout {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);
  private readonly analytics = inject(LandingAnalyticsService);
  private readonly webVitals = inject(WebVitalsService);
  private readonly currentPath = signal(this.pathFromUrl(this.router.url));
  private lastTrackedPath = '';

  protected readonly links = computed<NavLink[]>(() => {
    const current = this.currentPath();
    return PUBLIC_LINKS.map((link) => ({
      ...link,
      active: link.routerLink === '/' ? current === '/' : current.startsWith(link.routerLink),
    }));
  });

  protected readonly footerSurface = computed(() => {
    const current = this.currentPath();
    return current === '/como-funciona-el-ciclo' ? '#EDF7F3' : current === '/' ? '#EBE8DF' : '#FAF9F5';
  });

  constructor() {
    this.webVitals.start();
    this.applySeo(this.currentPath());
    this.trackPageView(this.currentPath());
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        const path = this.pathFromUrl(event.urlAfterRedirects);
        this.currentPath.set(path);
        this.applySeo(path);
        this.trackPageView(path);
      });
  }

  private trackPageView(path: string): void {
    if (path === this.lastTrackedPath) return;
    this.lastTrackedPath = path;
    this.analytics.track('public_page_view', { route: path });
  }

  private pathFromUrl(url: string): string {
    return url.split(/[?#]/, 1)[0] || '/';
  }

  private applySeo(path: string): void {
    const seo = PUBLIC_SEO[path] ?? PUBLIC_SEO['/'];
    this.titleService.setTitle(seo.title);
    this.metaService.updateTag({ name: 'description', content: seo.description });
    this.metaService.updateTag({ property: 'og:title', content: seo.title }, 'property="og:title"');
    this.metaService.updateTag({ property: 'og:description', content: seo.description }, 'property="og:description"');
    this.metaService.updateTag({ name: 'twitter:title', content: seo.title });
    this.metaService.updateTag({ name: 'twitter:description', content: seo.description });

    const canonical = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) {
      // `HTMLLinkElement.href` is not implemented by Angular's prerender DOM.
      // Build from the absolute value in index.html and update the attribute directly.
      const canonicalUrl = new URL(path, canonical.getAttribute('href') ?? 'https://partly.mx/').href;
      canonical.setAttribute('href', canonicalUrl);
      this.metaService.updateTag({ property: 'og:url', content: canonicalUrl }, 'property="og:url"');
    }
  }
}
