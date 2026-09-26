import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, tap, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import {
  AdminCommissionCharge,
  AdminCommissionsPage,
  AdminCommissionsSummary,
  BankAccountInput,
  CommissionCharge,
  CommissionChargeStatus,
  CommissionStatus,
  EarningEntriesPage,
  EarningsSummary,
  MyCommissions,
  PlatformBankAccount,
} from './commissions.models';
import { toErrorMessage } from './http-error.util';
import { ReminderResult } from './mail.models';

const fail = (error: HttpErrorResponse) => throwError(() => toErrorMessage(error));

@Injectable({ providedIn: 'root' })
export class CommissionsService {
  private readonly http = inject(HttpClient);

  /** Estado actual de la comisión del vendedor: lo lee el aviso del panel y lo refresca quien la paga. */
  readonly status = signal<CommissionStatus | null>(null);

  private statusLoading = false;
  private statusQueued = false;

  /** Si ya hay una petición en vuelo, la ráfaga se junta en un solo refresco al terminar (no una por llamada). */
  refreshStatus(): void {
    if (this.statusLoading) {
      this.statusQueued = true;
      return;
    }
    this.statusLoading = true;
    this.http
      .get<CommissionStatus>(`${API_BASE_URL}/commissions/status`)
      .pipe(
        finalize(() => {
          this.statusLoading = false;
          if (this.statusQueued) {
            this.statusQueued = false;
            this.refreshStatus();
          }
        }),
      )
      .subscribe({
        next: (status) => this.status.set(status),
        error: () => this.status.set(null),
      });
  }

  // ---- vendedor
  getEarningsSummary(): Observable<EarningsSummary> {
    return this.http.get<EarningsSummary>(`${API_BASE_URL}/earnings/summary`).pipe(catchError(fail));
  }

  getEarningEntries(page = 1, limit = 10): Observable<EarningEntriesPage> {
    const params = new HttpParams().set('page', page).set('limit', limit);
    return this.http.get<EarningEntriesPage>(`${API_BASE_URL}/earnings/entries`, { params }).pipe(catchError(fail));
  }

  getMine(): Observable<MyCommissions> {
    return this.http.get<MyCommissions>(`${API_BASE_URL}/commissions/me`).pipe(catchError(fail));
  }

  uploadReceipt(chargeId: string, file: File): Observable<CommissionCharge> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<CommissionCharge>(`${API_BASE_URL}/commissions/${chargeId}/receipt`, formData).pipe(
      tap(() => this.refreshStatus()),
      catchError(fail),
    );
  }

  /** El comprobante requiere sesión: se descarga como blob y se abre desde un object URL. */
  getReceiptBlob(chargeId: string): Observable<Blob> {
    return this.http.get(`${API_BASE_URL}/commissions/${chargeId}/receipt`, { responseType: 'blob' }).pipe(catchError(fail));
  }

  // ---- admin
  findAllForAdmin(status: CommissionChargeStatus | '', overdueOnly: boolean, page = 1, limit = 50): Observable<AdminCommissionsPage> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (status) params = params.set('status', status);
    if (overdueOnly) params = params.set('overdueOnly', 'true');
    return this.http.get<AdminCommissionsPage>(`${API_BASE_URL}/admin/commissions`, { params }).pipe(catchError(fail));
  }

  getAdminSummary(): Observable<AdminCommissionsSummary> {
    return this.http.get<AdminCommissionsSummary>(`${API_BASE_URL}/admin/commissions/summary`).pipe(catchError(fail));
  }

  review(chargeId: string, approve: boolean, reason?: string): Observable<AdminCommissionCharge> {
    return this.http.put<AdminCommissionCharge>(`${API_BASE_URL}/admin/commissions/${chargeId}/review`, { approve, reason }).pipe(catchError(fail));
  }

  /** Recordatorio (app + correo) al vendedor de su comisión por pagar. Máximo uno al día. */
  sendReminder(chargeId: string): Observable<ReminderResult> {
    return this.http.post<ReminderResult>(`${API_BASE_URL}/admin/commissions/${chargeId}/remind`, {}).pipe(catchError(fail));
  }

  getBankAccount(): Observable<PlatformBankAccount | null> {
    return this.http.get<PlatformBankAccount | null>(`${API_BASE_URL}/commissions/bank-account`).pipe(catchError(fail));
  }

  updateBankAccount(input: BankAccountInput): Observable<PlatformBankAccount | null> {
    return this.http.put<PlatformBankAccount | null>(`${API_BASE_URL}/admin/commissions/bank-account`, input).pipe(catchError(fail));
  }
}
