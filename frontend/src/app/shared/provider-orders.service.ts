import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import {
  CreateGroupFromProviderOrderInput,
  DeliverProviderOrderCredentialInput,
  PaginatedProviderOrders,
  ProviderOrder,
  ProviderOrderCredential,
  ProviderOrderStatus,
} from './provider-orders.models';
import { Group } from './groups.models';
import { toErrorMessage } from './http-error.util';

@Injectable({ providedIn: 'root' })
export class ProviderOrdersService {
  private readonly http = inject(HttpClient);

  /** Reserva una cuenta del mayoreo: tienes un plazo para transferir y subir tu comprobante. */
  create(listingId: string): Observable<ProviderOrder> {
    return this.http
      .post<ProviderOrder>(`${API_BASE_URL}/provider-orders`, { listingId })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Tus compras a proveedores (como vendedor). */
  findMine(status?: ProviderOrderStatus): Observable<PaginatedProviderOrders> {
    let params = new HttpParams().set('limit', 100);
    if (status) {
      params = params.set('status', status);
    }
    return this.http
      .get<PaginatedProviderOrders>(`${API_BASE_URL}/provider-orders/me`, { params })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Tus ventas como proveedor. */
  findAsProvider(status?: ProviderOrderStatus): Observable<PaginatedProviderOrders> {
    let params = new HttpParams().set('limit', 100);
    if (status) {
      params = params.set('status', status);
    }
    return this.http
      .get<PaginatedProviderOrders>(`${API_BASE_URL}/provider-orders/provider-me`, { params })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Detalle de una orden (comprador, proveedor o ADMIN). */
  findById(orderId: string): Observable<ProviderOrder> {
    return this.http
      .get<ProviderOrder>(`${API_BASE_URL}/provider-orders/${orderId}`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Credencial descifrada de tu compra ya entregada (solo el comprador). */
  getCredential(orderId: string): Observable<ProviderOrderCredential> {
    return this.http
      .get<ProviderOrderCredential>(`${API_BASE_URL}/provider-orders/${orderId}/credential`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Valida el pago de la compra (solo el proveedor): confirma que el dinero llegó a su banco. */
  approve(orderId: string): Observable<ProviderOrder> {
    return this.http
      .put<ProviderOrder>(`${API_BASE_URL}/provider-orders/${orderId}/approve`, {})
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Rechaza la solicitud de compra completa (solo el proveedor) — se libera el stock. */
  reject(orderId: string, reason?: string): Observable<ProviderOrder> {
    return this.http
      .put<ProviderOrder>(`${API_BASE_URL}/provider-orders/${orderId}/reject`, { reason })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Entrega las credenciales de una venta (solo el proveedor dueño de la orden). */
  deliver(orderId: string, input: DeliverProviderOrderCredentialInput): Observable<ProviderOrder> {
    return this.http
      .put<ProviderOrder>(`${API_BASE_URL}/provider-orders/${orderId}/deliver`, input)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Retira la compra (el comprador, antes de que se valide su pago) o la cancela (el proveedor). */
  cancel(orderId: string): Observable<ProviderOrder> {
    return this.http
      .post<ProviderOrder>(`${API_BASE_URL}/provider-orders/${orderId}/cancel`, {})
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Crea tu grupo a partir de esta compra ya entregada — la credencial se carga sola. */
  createGroup(orderId: string, input: CreateGroupFromProviderOrderInput): Observable<Group> {
    return this.http
      .post<Group>(`${API_BASE_URL}/provider-orders/${orderId}/create-group`, input)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Sube el comprobante de tu transferencia. */
  uploadReceipt(orderId: string, file: File): Observable<ProviderOrder> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http
      .post<ProviderOrder>(`${API_BASE_URL}/provider-orders/${orderId}/receipt`, formData)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** El comprobante requiere sesión: se descarga como blob y se abre desde un object URL. */
  getReceiptBlob(orderId: string): Observable<Blob> {
    return this.http
      .get(`${API_BASE_URL}/provider-orders/${orderId}/receipt`, { responseType: 'blob' })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** El comprobante no sirve: el comprador vuelve a esperar pago y puede subir otro (solo el proveedor). */
  rejectReceipt(orderId: string, reason?: string): Observable<ProviderOrder> {
    return this.http
      .put<ProviderOrder>(`${API_BASE_URL}/provider-orders/${orderId}/reject-receipt`, { reason })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Renueva una cuenta renovable (desde 7 días antes de que venza). */
  renew(orderId: string): Observable<ProviderOrder> {
    return this.http
      .post<ProviderOrder>(`${API_BASE_URL}/provider-orders/${orderId}/renew`, {})
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Compra la reposición de una cuenta no renovable que venció o está por vencer. */
  replace(orderId: string): Observable<ProviderOrder> {
    return this.http
      .post<ProviderOrder>(`${API_BASE_URL}/provider-orders/${orderId}/replace`, {})
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Marca como reembolsada una orden pagada y luego cancelada (solo el proveedor). */
  markRefunded(orderId: string): Observable<ProviderOrder> {
    return this.http
      .post<ProviderOrder>(`${API_BASE_URL}/provider-orders/${orderId}/refunded`, {})
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }
}
