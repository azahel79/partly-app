import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { CreateProviderListingInput, PaginatedProviderListings, ProviderListing, UpdateProviderListingInput } from './provider-listings.models';
import { toErrorMessage } from './http-error.util';

@Injectable({ providedIn: 'root' })
export class ProviderListingsService {
  private readonly http = inject(HttpClient);

  /** Cuentas activas de Partly disponibles para comprar al por mayor — lo que ve el vendedor. */
  findAvailable(page = 1, limit = 20): Observable<PaginatedProviderListings> {
    const params = new HttpParams().set('active', 'true').set('page', page).set('limit', limit);
    return this.http
      .get<PaginatedProviderListings>(`${API_BASE_URL}/provider-listings`, { params })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Detalle de una cuenta publicada — para la ficha antes de solicitar la compra. */
  findById(id: string): Observable<ProviderListing> {
    return this.http
      .get<ProviderListing>(`${API_BASE_URL}/provider-listings/${id}`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Tus propias cuentas publicadas al por mayor. */
  findMine(): Observable<ProviderListing[]> {
    return this.http
      .get<ProviderListing[]>(`${API_BASE_URL}/provider-listings/me`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  create(input: CreateProviderListingInput): Observable<ProviderListing> {
    return this.http
      .post<ProviderListing>(`${API_BASE_URL}/provider-listings`, input)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  update(id: string, input: UpdateProviderListingInput): Observable<ProviderListing> {
    return this.http
      .put<ProviderListing>(`${API_BASE_URL}/provider-listings/${id}`, input)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }
}
