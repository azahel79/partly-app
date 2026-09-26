import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { Credential, CredentialHistoryEntry, UpsertCredentialInput } from './credentials.models';
import { toErrorMessage } from './http-error.util';

@Injectable({ providedIn: 'root' })
export class CredentialsService {
  private readonly http = inject(HttpClient);

  /**
   * Credencial descifrada del grupo (owner o miembro ACTIVO).
   * `null` = autorizado pero el vendedor todavía no la captura (404 real, no un error).
   * Cualquier otro error (403 = no autorizado, etc.) se propaga como mensaje.
   */
  get(groupId: string): Observable<Credential | null> {
    return this.http.get<Credential>(`${API_BASE_URL}/groups/${groupId}/credential`).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 404) {
          return of(null);
        }
        return throwError(() => toErrorMessage(error));
      }),
    );
  }

  upsert(groupId: string, input: UpsertCredentialInput): Observable<Credential> {
    return this.http
      .put<Credential>(`${API_BASE_URL}/groups/${groupId}/credential`, input)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  getHistory(groupId: string): Observable<CredentialHistoryEntry[]> {
    return this.http
      .get<CredentialHistoryEntry[]>(`${API_BASE_URL}/groups/${groupId}/credential-history`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }
}
