import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { CreateIncidentInput, Incident, IncidentMessage, IncidentStatus, PaginatedIncidents } from './incidents.models';
import { toErrorMessage } from './http-error.util';

@Injectable({ providedIn: 'root' })
export class IncidentsService {
  private readonly http = inject(HttpClient);

  /** Tus incidencias — como quien reportó o como quien debe responder (owner del grupo). */
  findMine(page = 1, limit = 20): Observable<PaginatedIncidents> {
    const params = new HttpParams().set('page', page).set('limit', limit);
    return this.http
      .get<PaginatedIncidents>(`${API_BASE_URL}/incidents/me`, { params })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Todas las incidencias del sistema, opcionalmente filtradas por estado — solo ADMIN. */
  findAll(status?: IncidentStatus, page = 1, limit = 20): Observable<PaginatedIncidents> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (status) {
      params = params.set('status', status);
    }
    return this.http
      .get<PaginatedIncidents>(`${API_BASE_URL}/incidents`, { params })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  findOne(id: string): Observable<Incident> {
    return this.http
      .get<Incident>(`${API_BASE_URL}/incidents/${id}`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  findMessages(id: string): Observable<IncidentMessage[]> {
    return this.http
      .get<IncidentMessage[]>(`${API_BASE_URL}/incidents/${id}/messages`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  addMessage(id: string, body: string): Observable<IncidentMessage> {
    return this.http
      .post<IncidentMessage>(`${API_BASE_URL}/incidents/${id}/messages`, { body })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  create(input: CreateIncidentInput): Observable<Incident> {
    return this.http
      .post<Incident>(`${API_BASE_URL}/incidents`, input)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  updateStatus(id: string, status: IncidentStatus): Observable<Incident> {
    return this.http
      .put<Incident>(`${API_BASE_URL}/incidents/${id}/status`, { status })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }
}
