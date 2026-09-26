import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Protege todo el árbol de /admin en un solo guard (no depende de authGuard):
 * sin sesión manda al login de admin (con returnUrl, para regresar aquí después de loguearse);
 * con sesión pero sin rol ADMIN manda al panel normal, sin explicar por qué.
 * La protección real vive en el backend (RolesGuard + @Roles(ADMIN) en cada endpoint) — esto
 * es solo para no mostrarle la pantalla a quien no la va a poder usar.
 */
export const adminGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/admin/login'], { queryParams: { returnUrl: state.url } });
  }
  if (authService.isAdmin()) {
    return true;
  }
  return router.createUrlTree(['/panel']);
};
