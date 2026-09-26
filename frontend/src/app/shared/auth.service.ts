import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { AuthTokens, AuthUser, LoginResponse } from './auth.models';
import { toErrorMessage } from './http-error.util';

const ACCESS_TOKEN_KEY = 'vakeva.accessToken';
const REFRESH_TOKEN_KEY = 'vakeva.refreshToken';
const USER_KEY = 'vakeva.user';
export const OAUTH_RETURN_URL_KEY = 'vakeva.oauth.returnUrl';

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly currentUserSignal = signal<AuthUser | null>(readStoredUser());
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);
  readonly isAdmin = computed(() => this.currentUserSignal()?.role === 'ADMIN');

  register(name: string, email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${API_BASE_URL}/auth/register`, { name, email, password })
      .pipe(
        tap((session) => this.persistSession(session)),
        catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))),
      );
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${API_BASE_URL}/auth/login`, { email, password }).pipe(
      tap((session) => this.persistSession(session)),
      catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))),
    );
  }

  exchangeGoogleCode(code: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${API_BASE_URL}/auth/google/exchange`, { code }).pipe(
      tap((session) => this.persistSession(session)),
      catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))),
    );
  }

  /**
   * Navegación completa de navegador (no fetch): Google/Passport necesitan el flujo de redirect real.
   * `returnUrl` sobrevive el viaje redondo por Google (que no puede llevar query params nuestros) porque
   * lo guardamos en sessionStorage antes de salir; `oauth-callback` lo recoge al volver.
   */
  continueWithGoogle(returnUrl?: string): void {
    if (returnUrl) {
      sessionStorage.setItem(OAUTH_RETURN_URL_KEY, returnUrl);
    }
    window.location.href = `${API_BASE_URL}/auth/google`;
  }

  logout(): void {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    this.clearSession();

    if (refreshToken) {
      this.http.post(`${API_BASE_URL}/auth/logout`, { refreshToken }).subscribe({ error: () => undefined });
    }
  }

  logoutAll(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${API_BASE_URL}/auth/logout-all`, {}).pipe(
      tap(() => this.clearSession()),
      catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))),
    );
  }

  updateCurrentUser(user: AuthUser): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUserSignal.set(user);
  }

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  /** Hay una sesión guardada en este navegador que todavía se puede renovar. */
  hasStoredSession(): boolean {
    return localStorage.getItem(REFRESH_TOKEN_KEY) !== null;
  }

  /** Usado por el interceptor cuando una request cae en 401 por access token vencido (dura 15 min). */
  refreshSession(): Observable<AuthTokens> {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      return throwError(() => new Error('No hay sesión que refrescar.'));
    }

    return this.http.post<AuthTokens>(`${API_BASE_URL}/auth/refresh`, { refreshToken }).pipe(
      tap((tokens) => {
        localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      }),
    );
  }

  /** Cierra la sesión local sin llamar al backend — para cuando el refresh token ya no sirve. */
  clearSession(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUserSignal.set(null);
  }

  private persistSession(session: LoginResponse): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    this.currentUserSignal.set(session.user);
  }
}
