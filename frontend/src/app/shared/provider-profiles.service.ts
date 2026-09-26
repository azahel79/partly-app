import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { PaginatedProviderProfiles, ProviderProfile, ProviderProfileStatus } from './provider-profiles.models';
import { toErrorMessage } from './http-error.util';

@Injectable({ providedIn: 'root' })
export class ProviderProfilesService {
  private readonly http = inject(HttpClient);

  /** Tu propio perfil de proveedor, si ya lo activaste. 404 si todavía no. */
  findMine(): Observable<ProviderProfile> {
    return this.http
      .get<ProviderProfile>(`${API_BASE_URL}/provider-profiles/me`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Solo ADMIN — activa tu perfil de proveedor (queda APPROVED de inmediato). */
  activate(businessName: string): Observable<ProviderProfile> {
    return this.http
      .post<ProviderProfile>(`${API_BASE_URL}/provider-profiles/me`, { businessName })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Solo ADMIN — el backend rechaza esto con 403 si el token no tiene ese rol. */
  findAll(status?: ProviderProfileStatus): Observable<PaginatedProviderProfiles> {
    let params = new HttpParams().set('limit', 100);
    if (status) {
      params = params.set('status', status);
    }
    return this.http
      .get<PaginatedProviderProfiles>(`${API_BASE_URL}/provider-profiles`, { params })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  review(id: string, status: ProviderProfileStatus): Observable<ProviderProfile> {
    return this.http
      .put<ProviderProfile>(`${API_BASE_URL}/provider-profiles/${id}/status`, { status })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }
}
