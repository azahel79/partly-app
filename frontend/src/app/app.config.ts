import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling, withRouterConfig } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './shared/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(
      routes,
      // anchorScrolling apagado a propósito: LandingPage hace el scroll a mano vía
      // LenisScrollService (así usa el motor de scroll con inercia de la landing en vez de un
      // salto nativo instantáneo que compite con Lenis y se ve brusco).
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
      // Sin esto, los links del navbar de la landing (ej. "Explorar" -> "/#plataformas") no hacen
      // nada si ya estás en "/": el Router por default ignora una navegación a la misma URL, así
      // que nunca se dispara un cambio de fragmento que LandingPage pueda escuchar.
      withRouterConfig({ onSameUrlNavigation: 'reload' }),
    ),
  ],
};
