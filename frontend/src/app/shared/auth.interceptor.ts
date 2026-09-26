import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, shareReplay, switchMap, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { AuthTokens } from './auth.models';
import { AuthService } from './auth.service';

const NO_AUTH_RETRY_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/google/exchange'];

/** Margen para renovar poco antes de que venza, no justo al filo. */
const EXPIRY_SKEW_SECONDS = 20;

/**
 * Renovación de sesión en curso. El backend rota el refresh token en cada uso y, si recibe uno que ya
 * se usó, cierra todas las sesiones por seguridad. Cuando el access token vence, varias peticiones caen
 * en 401 a la vez: si cada una pidiera su propia renovación, la primera rotaría el token y las demás lo
 * presentarían ya usado (y además /auth/refresh solo admite 5 por minuto). Todas comparten esta.
 */
let refreshInFlight$: Observable<AuthTokens> | null = null;

function renewSession(authService: AuthService): Observable<AuthTokens> {
  if (!refreshInFlight$) {
    refreshInFlight$ = authService.refreshSession().pipe(
      finalize(() => {
        refreshInFlight$ = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
  }
  return refreshInFlight$;
}

/** El access token es un JWT: se lee su `exp` para saber si ya venció sin gastar una petición. */
function isExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now() + EXPIRY_SKEW_SECONDS * 1000;
  } catch {
    return false;
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isApiRequest = req.url.startsWith(API_BASE_URL);
  const canRetry = isApiRequest && !NO_AUTH_RETRY_PATHS.some((path) => req.url.includes(path));
  const sentToken = authService.getAccessToken();
  const withToken = (token: string | null) => (isApiRequest && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);

  // La sesión solo se cierra si el servidor dice que ya no sirve (refresh token inválido, vencido o
  // revocado). Un fallo pasajero al renovar (límite de peticiones, red caída, error del servidor) deja la
  // sesión intacta y solo hace fallar esta petición; un error de la petición reintentada sigue su camino.
  const renewOrLogout = () =>
    renewSession(authService).pipe(
      catchError((refreshError: unknown) => {
        const sessionIsDead = !(refreshError instanceof HttpErrorResponse) || refreshError.status === 401 || refreshError.status === 403;
        if (sessionIsDead) {
          authService.clearSession();
          router.navigateByUrl('/iniciar-sesion');
        }
        return throwError(() => refreshError);
      }),
    );

  // El access token dura 15 min. Si ya venció, se renueva antes de mandar la petición: así no se van
  // dejando 401 en la consola cada vez que se vuelve a la app después de un rato.
  if (canRetry && sentToken && authService.hasStoredSession() && isExpired(sentToken)) {
    return renewOrLogout().pipe(switchMap((tokens) => next(withToken(tokens.accessToken))));
  }

  return next(withToken(sentToken)).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !canRetry) {
        return throwError(() => error);
      }

      // Visitante sin sesión: no hay nada que renovar ni a dónde mandarlo desde aquí (las rutas privadas
      // ya las protege el guard).
      if (!sentToken && !authService.hasStoredSession()) {
        return throwError(() => error);
      }

      // Otra petición ya renovó la sesión mientras esta volaba: basta reintentar con el token nuevo.
      const currentToken = authService.getAccessToken();
      if (currentToken && currentToken !== sentToken) {
        return next(withToken(currentToken));
      }

      return renewOrLogout().pipe(switchMap((tokens) => next(withToken(tokens.accessToken))));
    }),
  );
};
