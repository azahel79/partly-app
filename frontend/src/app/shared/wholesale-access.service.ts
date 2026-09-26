import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import {
  AdminWholesaleAccessPage,
  AdminWholesaleAccessRow,
  MyWholesaleAccess,
  ReviewWholesaleAccessInput,
  WholesaleAccessStatus,
} from './wholesale-access.models';
import { toErrorMessage } from './http-error.util';

const fail = (error: HttpErrorResponse) => throwError(() => toErrorMessage(error));

@Injectable({ providedIn: 'root' })
export class WholesaleAccessService {
  private readonly http = inject(HttpClient);

  /** Tu acceso al mayoreo y qué te falta para tenerlo. */
  getMine(): Observable<MyWholesaleAccess> {
    return this.http.get<MyWholesaleAccess>(`${API_BASE_URL}/wholesale-access/me`).pipe(catchError(fail));
  }

  request(): Observable<MyWholesaleAccess> {
    return this.http.post<MyWholesaleAccess>(`${API_BASE_URL}/wholesale-access/request`, {}).pipe(catchError(fail));
  }

  // ---- admin
  findAll(status: WholesaleAccessStatus | '', search: string, page = 1, limit = 30): Observable<AdminWholesaleAccessPage> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (search.trim()) params = params.set('search', search.trim());
    else if (status) params = params.set('status', status);
    return this.http.get<AdminWholesaleAccessPage>(`${API_BASE_URL}/admin/wholesale-access`, { params }).pipe(catchError(fail));
  }

  review(userId: string, input: ReviewWholesaleAccessInput): Observable<AdminWholesaleAccessRow> {
    return this.http.put<AdminWholesaleAccessRow>(`${API_BASE_URL}/admin/wholesale-access/${userId}`, input).pipe(catchError(fail));
  }
}
