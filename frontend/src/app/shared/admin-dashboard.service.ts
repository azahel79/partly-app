import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { AdminDashboardData } from './admin-dashboard.models';
import { toErrorMessage } from './http-error.util';

@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  private readonly http = inject(HttpClient);

  getDashboard(): Observable<AdminDashboardData> {
    return this.http
      .get<AdminDashboardData>(`${API_BASE_URL}/admin/dashboard`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }
}
