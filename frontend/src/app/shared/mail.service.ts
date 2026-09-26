import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { EmailStatus, MailMessageDetail, MailMessagesPage, MailMessageSummary, MailStatus } from './mail.models';
import { toErrorMessage } from './http-error.util';

const fail = (error: HttpErrorResponse) => throwError(() => toErrorMessage(error));

/** Bandeja de salida de correos (solo admin). */
@Injectable({ providedIn: 'root' })
export class MailService {
  private readonly http = inject(HttpClient);

  getStatus(): Observable<MailStatus> {
    return this.http.get<MailStatus>(`${API_BASE_URL}/admin/mail/status`).pipe(catchError(fail));
  }

  list(status: EmailStatus | '', search: string, page = 1, limit = 30): Observable<MailMessagesPage> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (status) params = params.set('status', status);
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<MailMessagesPage>(`${API_BASE_URL}/admin/mail/messages`, { params }).pipe(catchError(fail));
  }

  findOne(id: string): Observable<MailMessageDetail> {
    return this.http.get<MailMessageDetail>(`${API_BASE_URL}/admin/mail/messages/${id}`).pipe(catchError(fail));
  }

  retry(id: string): Observable<MailMessageSummary> {
    return this.http.post<MailMessageSummary>(`${API_BASE_URL}/admin/mail/messages/${id}/retry`, {}).pipe(catchError(fail));
  }

  sendTest(to?: string): Observable<MailMessageSummary> {
    return this.http.post<MailMessageSummary>(`${API_BASE_URL}/admin/mail/test`, to ? { to } : {}).pipe(catchError(fail));
  }
}
