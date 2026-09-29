import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { AccountSession, AdminUser, ListUsersQuery, PaginatedUsers, PayoutAccountType, ProfileUpdate, Role, TrustSummary } from './users.models';
import { toErrorMessage } from './http-error.util';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);

  /** Solo ADMIN — el backend rechaza esto con 403 si el token no tiene ese rol. */
  findAll(query: ListUsersQuery = {}): Observable<PaginatedUsers> {
    let params = new HttpParams().set('page', query.page ?? 1).set('limit', query.limit ?? 20);
    if (query.role) {
      params = params.set('role', query.role);
    }
    if (query.authProvider) {
      params = params.set('authProvider', query.authProvider);
    }
    if (query.search) {
      params = params.set('search', query.search);
    }
    return this.http
      .get<PaginatedUsers>(`${API_BASE_URL}/users`, { params })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  updateRole(id: string, role: Role): Observable<AdminUser> {
    return this.http
      .put<AdminUser>(`${API_BASE_URL}/users/${id}/role`, { role })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Tu cuenta de abono guardada en el perfil (descifrada), o null si todavía no la configuras. */
  getPayoutAccount(): Observable<{ holder: string; bankName: string; accountNumber: string; accountType: PayoutAccountType } | null> {
    return this.http
      .get<{ holder: string; bankName: string; accountNumber: string; accountType: PayoutAccountType } | null>(`${API_BASE_URL}/users/me/payout-account`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  getMine(): Observable<AdminUser> {
    return this.http.get<AdminUser>(`${API_BASE_URL}/users/me`).pipe(
      catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))),
    );
  }

  updateMine(update: ProfileUpdate): Observable<AdminUser> {
    return this.http.put<AdminUser>(`${API_BASE_URL}/users/me`, update).pipe(
      catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))),
    );
  }

  getTrustSummary(): Observable<TrustSummary> {
    return this.http.get<TrustSummary>(`${API_BASE_URL}/users/me/trust-summary`).pipe(
      catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))),
    );
  }

  getSessions(): Observable<AccountSession[]> {
    return this.http.get<AccountSession[]>(`${API_BASE_URL}/users/me/sessions`).pipe(
      catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))),
    );
  }

  revokeSession(id: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/users/me/sessions/${id}`).pipe(
      catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))),
    );
  }

  exportMine(): Observable<unknown> {
    return this.http.get(`${API_BASE_URL}/users/me/export`).pipe(
      catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))),
    );
  }

  cancelMine(currentPassword?: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/users/me`, { body: { currentPassword } }).pipe(
      catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))),
    );
  }
}
