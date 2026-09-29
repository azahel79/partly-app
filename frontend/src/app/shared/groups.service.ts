import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { AdminGroupDetail, CreateGroupInput, Group, GroupApprovalStatus, GroupJoinPreview, GroupProfile, GroupStartPreview, GroupStatus, PaginatedGroups, ReservedSeat, SimilarMembership } from './groups.models';
import { Membership, MembershipStatus } from './memberships.models';
import { toErrorMessage } from './http-error.util';

@Injectable({ providedIn: 'root' })
export class GroupsService {
  private readonly http = inject(HttpClient);

  /** Conteo público de grupos activos en el marketplace — sin autenticación, para la landing. */
  publicStats(): Observable<{ activeGroupsCount: number }> {
    return this.http
      .get<{ activeGroupsCount: number }>(`${API_BASE_URL}/groups/public-stats`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Grupos que el usuario actual posee (owner) — su "panel de vendedor". */
  findMine(): Observable<Group[]> {
    return this.http
      .get<Group[]>(`${API_BASE_URL}/groups/mine`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Grupos donde el usuario actual es miembro — su "panel de comprador". */
  findJoined(): Observable<Group[]> {
    return this.http
      .get<Group[]>(`${API_BASE_URL}/groups/joined`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Sales de un grupo del que eras miembro. */
  /** Lugares que apartaste o estás pagando (todavía no activos). */
  findReserved(): Observable<ReservedSeat[]> {
    return this.http
      .get<ReservedSeat[]>(`${API_BASE_URL}/groups/reserved`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Para el vendedor: si alguien con acceso salió y falta cambiar la contraseña de la cuenta. */
  getCredentialStatus(groupId: string): Observable<{ rotationPending: boolean; since: string | null; departures: number; lastMemberName: string | null }> {
    return this.http
      .get<{ rotationPending: boolean; since: string | null; departures: number; lastMemberName: string | null }>(`${API_BASE_URL}/groups/${groupId}/credential-status`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Tu lugar en otro grupo de la misma plataforma, o null. */
  findSimilarMembership(groupId: string): Observable<SimilarMembership | null> {
    return this.http
      .get<SimilarMembership | null>(`${API_BASE_URL}/groups/${groupId}/similar-membership`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  leave(groupId: string): Observable<void> {
    return this.http
      .post<void>(`${API_BASE_URL}/groups/${groupId}/leave`, {})
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Saca a un miembro del grupo (solo el owner) — libera su cupo. */
  removeMember(groupId: string, membershipId: string): Observable<void> {
    return this.http
      .delete<void>(`${API_BASE_URL}/groups/${groupId}/members/${membershipId}`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Grupos públicos buscando miembros — lo que ve un comprador para unirse. */
  findAvailable(
    page = 1,
    limit = 20,
    categoryId?: string,
    ownerId?: string,
    options: { withSpots?: boolean; stage?: 'forming' | 'running' | 'freeing' } = {},
  ): Observable<PaginatedGroups> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (options.withSpots) {
      params = params.set('withSpots', 'true');
    }
    if (options.stage) {
      params = params.set('stage', options.stage);
    }
    if (categoryId) {
      params = params.set('categoryId', categoryId);
    }
    if (ownerId) {
      params = params.set('ownerId', ownerId);
    }
    return this.http
      .get<PaginatedGroups>(`${API_BASE_URL}/groups`, { params })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Cola de grupos nuevos esperando aprobación — solo ADMIN. */
  findPendingApproval(page = 1, limit = 20): Observable<PaginatedGroups> {
    const params = new HttpParams().set('page', page).set('limit', limit);
    return this.http
      .get<PaginatedGroups>(`${API_BASE_URL}/groups/pending-approval`, { params })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Aprueba o rechaza un grupo — solo ADMIN. `reason` es obligatorio para REJECTED. */
  reviewApproval(groupId: string, status: 'APPROVED' | 'REJECTED', reason?: string): Observable<Group> {
    return this.http
      .put<Group>(`${API_BASE_URL}/groups/${groupId}/approval`, { status, reason })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Todos los grupos con su estado de aprobación, para el panel de staff — solo ADMIN. */
  findAllForAdmin(status?: GroupApprovalStatus, page = 1, limit = 50): Observable<PaginatedGroups> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (status) {
      params = params.set('status', status);
    }
    return this.http
      .get<PaginatedGroups>(`${API_BASE_URL}/groups/admin`, { params })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Detalle público de un grupo (para "Ver detalles"). */
  findOne(groupId: string): Observable<Group> {
    return this.http
      .get<Group>(`${API_BASE_URL}/groups/${groupId}`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Miembros reales de un grupo — solo el owner (o admin) puede verlos. */
  findMembers(groupId: string): Observable<Membership[]> {
    return this.http
      .get<Membership[]>(`${API_BASE_URL}/groups/${groupId}/members`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Tu estado dentro del grupo (cupo reservado, esperando pago, activo…), o null si no estás. */
  findMyMembership(groupId: string): Observable<{ id: string; status: MembershipStatus; currentPeriodEnd: string; autoRenew: boolean } | null> {
    return this.http
      .get<{ id: string; status: MembershipStatus; currentPeriodEnd: string; autoRenew: boolean } | null>(`${API_BASE_URL}/groups/${groupId}/my-membership`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Activa o desactiva la renovación automática de tu lugar (apagarla es para quien solo quiere probar). */
  setAutoRenew(groupId: string, autoRenew: boolean): Observable<{ id: string; status: MembershipStatus; currentPeriodEnd: string; autoRenew: boolean }> {
    return this.http
      .put<{ id: string; status: MembershipStatus; currentPeriodEnd: string; autoRenew: boolean }>(`${API_BASE_URL}/groups/${groupId}/my-membership/auto-renew`, { autoRenew })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Cuánto pagarías al entrar hoy: solo los días que quedan del ciclo, si quedan los mínimos para entrar. */
  getJoinPreview(groupId: string): Observable<GroupJoinPreview> {
    return this.http
      .get<GroupJoinPreview>(`${API_BASE_URL}/groups/${groupId}/join-preview`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Números para decidir si iniciar el grupo (solo el vendedor). */
  getStartPreview(groupId: string): Observable<GroupStartPreview> {
    return this.http
      .get<GroupStartPreview>(`${API_BASE_URL}/groups/${groupId}/start-preview`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Inicia el servicio del grupo: fija la renovación y le cobra a cada cupo reservado. */
  startGroup(groupId: string): Observable<Group> {
    return this.http
      .post<Group>(`${API_BASE_URL}/groups/${groupId}/start`, {})
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  create(input: CreateGroupInput): Observable<Group> {
    return this.http
      .post<Group>(`${API_BASE_URL}/groups`, input)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /**
   * Devuelve la membresía: RESERVED (el grupo no inicia, no se paga aún) o PENDING_PAYMENT (a pagar ya).
   * `switchFromGroupId` suelta tu lugar sin pagar en ese otro grupo de la misma plataforma ("cambiarme a este").
   */
  join(groupId: string, switchFromGroupId?: string): Observable<Membership> {
    return this.http
      .post<Membership>(`${API_BASE_URL}/groups/${groupId}/join`, switchFromGroupId ? { switchFromGroupId } : {})
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Pausar/reabrir un grupo propio — mismo endpoint que usaría un futuro formulario de edición completo. */
  setStatus(groupId: string, status: Extract<GroupStatus, 'SEARCHING_MEMBERS' | 'PAUSED' | 'CANCELLED'>): Observable<Group> {
    return this.http
      .put<Group>(`${API_BASE_URL}/groups/${groupId}`, { status })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Edita precio/cupos/día de cobro de un grupo — lo puede usar el owner o un ADMIN. */
  updateGroup(groupId: string, changes: { pricePerSlot?: number; availableSlots?: number; billingDay?: number }): Observable<Group> {
    return this.http
      .put<Group>(`${API_BASE_URL}/groups/${groupId}`, changes)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Detalle completo para el panel de staff (notas internas, ventas del vendedor, si ya tiene credenciales) — solo ADMIN. */
  findAdminDetail(groupId: string): Observable<AdminGroupDetail> {
    return this.http
      .get<AdminGroupDetail>(`${API_BASE_URL}/groups/admin/${groupId}`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Nota privada del admin sobre el grupo — nunca la ve el vendedor. */
  updateAdminNotes(groupId: string, notes: string): Observable<AdminGroupDetail> {
    return this.http
      .put<AdminGroupDetail>(`${API_BASE_URL}/groups/${groupId}/admin-notes`, { notes })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Manda un mensaje al vendedor — le llega como notificación real. */
  sendMessageToSeller(groupId: string, message: string): Observable<void> {
    return this.http
      .post<void>(`${API_BASE_URL}/groups/${groupId}/message`, { message })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Solicita las credenciales y cambia el flujo del grupo a "credenciales solicitadas". */
  requestCredentials(groupId: string): Observable<void> {
    return this.http
      .post<void>(`${API_BASE_URL}/groups/${groupId}/request-credentials`, {})
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  /** Perfiles de la cuenta compartida (al estilo Netflix) y a quién está asignado cada uno — owner o ADMIN. */
  findProfiles(groupId: string): Observable<GroupProfile[]> {
    return this.http
      .get<GroupProfile[]>(`${API_BASE_URL}/groups/${groupId}/profiles`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  createProfile(groupId: string, label: string): Observable<GroupProfile> {
    return this.http
      .post<GroupProfile>(`${API_BASE_URL}/groups/${groupId}/profiles`, { label })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  renameProfile(groupId: string, profileId: string, label: string): Observable<GroupProfile> {
    return this.http
      .put<GroupProfile>(`${API_BASE_URL}/groups/${groupId}/profiles/${profileId}`, { label })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }

  deleteProfile(groupId: string, profileId: string): Observable<void> {
    return this.http
      .delete<void>(`${API_BASE_URL}/groups/${groupId}/profiles/${profileId}`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toErrorMessage(error))));
  }
}
