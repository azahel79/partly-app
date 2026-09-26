import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { PaginatedReviews, Review, ReviewEligibility } from './reviews.models';
import { toErrorMessage } from './http-error.util';

@Injectable({ providedIn: 'root' })
export class ReviewsService {
  private readonly http = inject(HttpClient);

  /** Reseñas públicas de un grupo — dejadas por quienes fueron miembros. */
  findByGroup(groupId: string, page = 1, limit = 20): Observable<PaginatedReviews> {
    const params = new HttpParams().set('page', page).set('limit', limit);
    return this.http
      .get<PaginatedReviews>(`${API_BASE_URL}/groups/${groupId}/reviews`, { params })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Crea o actualiza tu propia reseña de un grupo del que fuiste miembro. */
  upsert(groupId: string, rating: number, comment?: string): Observable<Review> {
    return this.http
      .put<Review>(`${API_BASE_URL}/groups/${groupId}/review`, { rating, comment })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Si ya puedes reseñar este grupo y, si no, el motivo. */
  eligibility(groupId: string): Observable<ReviewEligibility> {
    return this.http
      .get<ReviewEligibility>(`${API_BASE_URL}/groups/${groupId}/review/eligibility`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** El vendedor responde públicamente a una reseña de su grupo. */
  reply(groupId: string, reviewId: string, reply: string): Observable<Review> {
    return this.http
      .put<Review>(`${API_BASE_URL}/groups/${groupId}/reviews/${reviewId}/reply`, { reply })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Elimina tu propia reseña de un grupo. */
  remove(groupId: string): Observable<void> {
    return this.http
      .delete<void>(`${API_BASE_URL}/groups/${groupId}/review`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }
}
