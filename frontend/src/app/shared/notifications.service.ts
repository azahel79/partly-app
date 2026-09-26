import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { Notification, PaginatedNotifications } from './notifications.models';
import { toErrorMessage } from './http-error.util';

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);

  findMine(page = 1, limit = 20, unreadOnly = false): Observable<PaginatedNotifications> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (unreadOnly) {
      params = params.set('unreadOnly', 'true');
    }
    return this.http
      .get<PaginatedNotifications>(`${API_BASE_URL}/notifications`, { params })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  markRead(id: string): Observable<Notification> {
    return this.http
      .put<Notification>(`${API_BASE_URL}/notifications/${id}/read`, {})
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  markAllRead(): Observable<{ updated: number }> {
    return this.http
      .post<{ updated: number }>(`${API_BASE_URL}/notifications/read-all`, {})
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }
}
