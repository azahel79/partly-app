import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { PaginatedPlans } from './plans.models';
import { toErrorMessage } from './http-error.util';

@Injectable({ providedIn: 'root' })
export class PlansService {
  private readonly http = inject(HttpClient);

  /** Planes activos, para el selector de "Crear grupo" — 100 alcanza sin necesitar paginación real todavía. */
  listActive(): Observable<PaginatedPlans> {
    const params = new HttpParams().set('active', 'true').set('limit', 100);
    return this.http
      .get<PaginatedPlans>(`${API_BASE_URL}/plans`, { params })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }
}
