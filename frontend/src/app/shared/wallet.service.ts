import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { HttpParams } from '@angular/common/http';
import { PaginatedWalletTransactions, Wallet } from './wallet.models';
import { toErrorMessage } from './http-error.util';

@Injectable({ providedIn: 'root' })
export class WalletService {
  private readonly http = inject(HttpClient);

  getMine(): Observable<Wallet> {
    return this.http
      .get<Wallet>(`${API_BASE_URL}/wallet/me`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Tus movimientos: abonos por pagos, ventas al por mayor, retiros y reembolsos. */
  getTransactions(page = 1, limit = 20): Observable<PaginatedWalletTransactions> {
    const params = new HttpParams().set('page', page).set('limit', limit);
    return this.http
      .get<PaginatedWalletTransactions>(`${API_BASE_URL}/wallet/me/transactions`, { params })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Solo ADMIN — el backend rechaza esto con 403 si el token no tiene ese rol. */
  getByUserId(userId: string): Observable<Wallet> {
    return this.http
      .get<Wallet>(`${API_BASE_URL}/wallet/${userId}`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }
}
