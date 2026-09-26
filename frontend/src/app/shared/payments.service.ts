import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { AdminPaymentsPage, AdminReceiptFilter, PaginatedPendingPayments, Payment, PaymentStatus } from './payments.models';
import { ReminderResult } from './mail.models';
import { toErrorMessage } from './http-error.util';

@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private readonly http = inject(HttpClient);

  /** Supervisión global para staff. No expone ninguna acción de aprobación. Con `groupId`, filtra los movimientos a un solo grupo. */
  findAllForAdmin(
    status: PaymentStatus | '' = '',
    receipt: AdminReceiptFilter = '',
    page = 1,
    limit = 50,
    groupId?: string,
  ): Observable<AdminPaymentsPage> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (status) params = params.set('status', status);
    if (receipt) params = params.set('receipt', receipt);
    if (groupId) params = params.set('groupId', groupId);
    return this.http
      .get<AdminPaymentsPage>(`${API_BASE_URL}/admin/payments`, { params })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Recordatorio (app + correo): al comprador si no sube su comprobante, al vendedor si ya lo subió. Máximo uno al día por persona. */
  sendReminder(paymentId: string): Observable<ReminderResult> {
    return this.http
      .post<ReminderResult>(`${API_BASE_URL}/admin/payments/${paymentId}/remind`, {})
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Tu propio pago pendiente en este grupo — null si no debes nada ahora mismo (ya aprobado). */
  findMine(groupId: string): Observable<Payment | null> {
    return this.http
      .get<Payment | null>(`${API_BASE_URL}/groups/${groupId}/payments/mine`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  uploadReceipt(groupId: string, file: File): Observable<Payment> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http
      .post<Payment>(`${API_BASE_URL}/groups/${groupId}/payments/receipt`, formData)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Cola de pagos pendientes de revisar — solo el owner del grupo. */
  findPending(groupId: string, onlyWithReceipt = false, page = 1, limit = 20): Observable<PaginatedPendingPayments> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (onlyWithReceipt) {
      params = params.set('onlyWithReceipt', 'true');
    }
    return this.http
      .get<PaginatedPendingPayments>(`${API_BASE_URL}/groups/${groupId}/payments/pending`, { params })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  review(groupId: string, paymentId: string, approve: boolean, reason?: string, profileId?: string): Observable<Payment> {
    return this.http
      .put<Payment>(`${API_BASE_URL}/groups/${groupId}/payments/${paymentId}/review`, { approve, reason, profileId })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /**
   * El endpoint del comprobante requiere el token de sesión, así que no se puede usar como un
   * <img src> o <a href> directo — se descarga como blob (el interceptor sí le pone el
   * Authorization) y se abre desde un object URL.
   */
  getReceiptBlob(groupId: string, paymentId: string): Observable<Blob> {
    return this.http
      .get(`${API_BASE_URL}/groups/${groupId}/payments/${paymentId}/receipt`, { responseType: 'blob' })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }
}
