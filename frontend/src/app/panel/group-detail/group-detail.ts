import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GroupsService } from '../../shared/groups.service';
import { AuthService } from '../../shared/auth.service';
import { ReviewsService } from '../../shared/reviews.service';
import { CredentialsService } from '../../shared/credentials.service';
import { PaymentsService } from '../../shared/payments.service';
import { Group, GroupJoinPreview, GroupProfile } from '../../shared/groups.models';
import { Review, ReviewEligibility } from '../../shared/reviews.models';
import { Credential } from '../../shared/credentials.models';
import { Payment, PendingPayment } from '../../shared/payments.models';
import { Membership } from '../../shared/memberships.models';
import { planFeatures } from '../../shared/plan-features.util';
import { avatarColor as pastelColor } from '../../shared/avatar-color.util';
import { ConfirmService } from '../../shared/confirm.service';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';
import { RenewalToggle } from '../../shared/renewal-toggle/renewal-toggle';
import { MoneyPipe } from '../../shared/money';
import { seatSegments } from '../../shared/seat-bar.util';

@Component({
  imports: [RouterLink, NgTemplateOutlet, PlatformLogo, RenewalToggle, MoneyPipe],
  selector: 'app-group-detail',
  styleUrl: './group-detail.css',
  templateUrl: './group-detail.html',
})
export class GroupDetail implements OnInit {
  private readonly confirmService = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly groupsService = inject(GroupsService);
  private readonly reviewsService = inject(ReviewsService);
  private readonly credentialsService = inject(CredentialsService);
  private readonly paymentsService = inject(PaymentsService);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly authService = inject(AuthService);

  protected scrollToCredentials(): void {
    document.getElementById('credenciales')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected readonly group = signal<Group | null>(null);
  protected readonly notFound = signal(false);

  protected readonly reviews = signal<Review[] | null>(null);
  protected readonly reviewsTotal = signal(0);
  protected readonly reviewsPageIndex = signal(0);
  protected readonly showAllReviews = signal(false);
  protected readonly reviewsPerPage = 3;

  protected readonly otherGroups = signal<Group[] | null>(null);
  protected readonly otherGroupsTotal = signal(0);

  protected readonly joining = signal(false);
  protected readonly joined = signal(false);
  /** Reservaste cupo pero el vendedor todavía no inicia el grupo: aún no pagas nada. */
  protected readonly reserved = signal(false);
  protected readonly hasPendingPayment = signal(false);
  /** Pago pendiente propio: el primer pago, o la renovación cuando ya se abrió su cobro (3 días antes del corte). */
  protected readonly ownPayment = signal<Payment | null>(null);
  protected readonly joinError = signal<string | null>(null);
  /** Precio de entrada (completo o prorrateado) que ve quien todavía no es miembro. */
  protected readonly joinPreview = signal<GroupJoinPreview | null>(null);

  /** undefined = todavía no se intentó cargar; null = autorizado pero sin capturar; Credential = capturada. */
  protected readonly credential = signal<Credential | null | undefined>(undefined);
  protected readonly credentialAccessDenied = signal(false);
  protected readonly showCredentialPassword = signal(false);
  protected readonly copiedField = signal<'username' | 'password' | null>(null);

  protected readonly groupMembers = signal<Membership[] | null>(null);
  protected readonly pendingPayments = signal<PendingPayment[] | null>(null);
  protected readonly reviewingId = signal<string | null>(null);
  protected readonly viewingReceiptId = signal<string | null>(null);
  protected readonly rejectingId = signal<string | null>(null);
  protected readonly rejectReason = signal('');
  protected readonly errorMessageForOwnerReview = signal<string | null>(null);
  protected readonly selectedProfileByPayment = signal<Record<string, string>>({});

  protected readonly receiptPreviewUrl = signal<string | null>(null);
  protected readonly receiptPreviewIsPdf = signal(false);
  protected readonly receiptPreviewSafeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.receiptPreviewUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  protected readonly profiles = signal<GroupProfile[] | null>(null);
  protected readonly newProfileLabel = signal('');
  protected readonly savingProfile = signal(false);
  protected readonly profileError = signal<string | null>(null);
  protected readonly renamingProfileId = signal<string | null>(null);
  protected readonly renameLabel = signal('');
  protected readonly deletingProfileId = signal<string | null>(null);

  protected readonly availableProfiles = computed(() => (this.profiles() ?? []).filter((p) => !p.assignedTo));

  protected readonly openProfileMenuId = signal<string | null>(null);
  protected readonly openMemberMenuId = signal<string | null>(null);
  protected readonly memberManageMode = signal(false);
  protected readonly removingMemberId = signal<string | null>(null);
  protected readonly memberActionError = signal<string | null>(null);
  protected readonly linkCopied = signal(false);

  protected readonly reviewFormOpen = signal(false);
  protected readonly reviewRatingDraft = signal(5);
  protected readonly reviewCommentDraft = signal('');
  protected readonly savingReview = signal(false);
  protected readonly reviewSaveError = signal<string | null>(null);
  protected readonly deletingReview = signal(false);
  /** Si ya puedes reseñar (pago validado y 7 días con el servicio); solo se consulta si eres miembro activo. */
  protected readonly reviewEligibility = signal<ReviewEligibility | null>(null);
  protected readonly replyingId = signal<string | null>(null);
  protected readonly replyDraft = signal('');
  protected readonly savingReply = signal(false);
  protected readonly replyError = signal<string | null>(null);

  /** Tu propia reseña dentro de la lista pública, si ya dejaste una. */
  protected readonly myReview = computed(() => {
    const me = this.authService.currentUser();
    return me ? (this.reviews() ?? []).find((r) => r.author.id === me.id) ?? null : null;
  });

  private readonly profileEmojis = ['🧑', '🐱', '🐼', '🦁', '🧑‍🚀', '🦊', '🐵', '🐰', '🐨', '🐯'];

  /** Avatar decorativo por perfil — no hay fotos reales para perfiles de cuenta compartida. */
  protected profileEmoji(index: number): string {
    return this.profileEmojis[index % this.profileEmojis.length];
  }

  protected readonly credentialFormOpen = signal(false);
  protected readonly credUsername = signal('');
  protected readonly credPassword = signal('');
  protected readonly credNotes = signal('');
  protected readonly savingCredential = signal(false);
  protected readonly credentialSaveError = signal<string | null>(null);
  protected readonly credentialSent = signal(false);

  protected readonly stars = [1, 2, 3, 4, 5];
  protected readonly planFeatures = planFeatures;
  protected readonly pastelColor = pastelColor;

  protected readonly isOwner = computed(() => {
    const g = this.group();
    const me = this.authService.currentUser();
    return !!g && !!me && g.owner.id === me.id;
  });

  /** Insignia de estado del hero — refleja el mismo criterio y colores que la lista "Mis grupos". */
  /** Etiqueta del encabezado. Verde = en orden, ámbar = falta algo, azul = esperando, rojo = rechazado. */
  protected readonly heroStatusBadge = computed(() => {
    const g = this.group();
    if (!g) {
      return null;
    }
    if (g.approvalStatus === 'PENDING') {
      return { label: 'En revisión', tone: 'ui-pill--info' };
    }
    // Para el comprador importa su lugar, no si el grupo está lleno.
    if (this.joined() && !this.isOwner()) {
      const pay = this.ownPayment();
      if (pay?.receiptUploadedAt) {
        return { label: 'Renovación por revisar', tone: 'ui-pill--info' };
      }
      if (pay) {
        return { label: 'Renovación por pagar', tone: 'ui-pill--warn' };
      }
      return { label: 'Activo', tone: 'ui-pill--ok' };
    }
    if (g.approvalStatus === 'REJECTED') {
      return { label: 'Rechazado', tone: 'ui-pill--danger' };
    }
    if (g.status === 'PAUSED') {
      return { label: 'Pausado', tone: '' };
    }
    if (g.status === 'CANCELLED') {
      return { label: 'Cancelado', tone: '' };
    }
    if (g.status === 'FULL') {
      return { label: 'Lleno', tone: 'ui-pill--ok' };
    }
    if (g.status === 'READY_TO_START') {
      return { label: 'Listo para iniciar', tone: 'ui-pill--ok' };
    }
    if (!g.startedAt) {
      return { label: 'Juntando lugares', tone: 'ui-pill--info' };
    }
    if (g.heldSlots > 0) {
      return { label: 'Iniciado · esperando pagos', tone: 'ui-pill--warn' };
    }
    return { label: 'Activo', tone: 'ui-pill--ok' };
  });

  /** Un segmento por lugar: ocupado, por liberarse (no renueva), apartado o libre. */
  protected readonly seatBar = computed(() => {
    const g = this.group();
    return g ? seatSegments(g) : [];
  });

  protected periodNoun(period: string): string {
    return period === 'MONTHLY' ? 'mes' : period === 'QUARTERLY' ? 'trimestre' : period === 'SEMIANNUAL' ? 'semestre' : 'año';
  }

  protected round(value: string): number {
    return Math.round(parseFloat(value));
  }

  private readonly avatarColors = [
    { bg: 'bg-violet-500', text: 'text-white' },
    { bg: 'bg-emerald-500', text: 'text-white' },
    { bg: 'bg-pink', text: 'text-white' },
    { bg: 'bg-amber-500', text: 'text-white' },
    { bg: 'bg-teal-500', text: 'text-white' },
  ];

  /** Color rotativo por posición — solo para el fallback de inicial, no afecta fotos reales. */
  protected avatarColor(index: number): { bg: string; text: string } {
    return this.avatarColors[index % this.avatarColors.length];
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.notFound.set(true);
      return;
    }
    this.groupsService.findOne(id).subscribe({
      next: (group) => {
        this.group.set(group);
        this.loadReviews(id);
        this.loadOtherGroups(group.owner.id, id);
        if (this.isOwner()) {
          this.loadCredential(id);
          this.loadPendingPayments(id);
          this.loadMembers(id);
          this.loadProfiles(id);
        } else {
          this.loadAccess(id);
        }
      },
      error: () => this.notFound.set(true),
    });
  }

  /**
   * Primero se consulta el estado del visitante en el grupo y solo se piden los datos a los que ese
   * estado da acceso: credencial y miembros son solo del owner o de un miembro activo, y el pago
   * pendiente solo existe si ya se pidió pagar. Pedirlos "a ver si contesta" llenaba la consola de
   * 403/404 (y gastaba el límite de peticiones por minuto) en cada visita a un grupo ajeno.
   */
  private loadAccess(groupId: string): void {
    this.groupsService.findMyMembership(groupId).subscribe({
      next: (membership) => {
        const status = membership?.status ?? null;
        this.reserved.set(status === 'RESERVED');
        if (status === 'ACTIVE') {
          this.joined.set(true);
          this.loadCredential(groupId);
          this.loadMembers(groupId);
          this.loadOwnPaymentStatus(groupId);
          this.reviewsService.eligibility(groupId).subscribe({
            next: (eligibility) => this.reviewEligibility.set(eligibility),
            error: () => this.reviewEligibility.set(null),
          });
        } else {
          this.credentialAccessDenied.set(true);
        }
        if (status === 'PENDING_PAYMENT') {
          this.loadOwnPaymentStatus(groupId);
        }
        if (status === null) {
          this.loadJoinPreview(groupId);
        }
      },
      error: () => {
        this.reserved.set(false);
        this.credentialAccessDenied.set(true);
      },
    });
  }

  private loadProfiles(groupId: string): void {
    this.groupsService.findProfiles(groupId).subscribe({
      next: (profiles) => this.profiles.set(profiles),
      error: () => this.profiles.set([]),
    });
  }

  private loadJoinPreview(groupId: string): void {
    this.groupsService.getJoinPreview(groupId).subscribe({
      next: (preview) => this.joinPreview.set(preview),
      error: () => this.joinPreview.set(null),
    });
  }

  private loadOwnPaymentStatus(groupId: string): void {
    this.paymentsService.findMine(groupId).subscribe({
      next: (payment) => {
        this.ownPayment.set(payment);
        this.hasPendingPayment.set(payment !== null);
      },
      error: () => {
        this.ownPayment.set(null);
        this.hasPendingPayment.set(false);
      },
    });
  }

  /** Owner ve a todos (incluye pendientes de pago); un miembro ACTIVO solo ve a los demás ACTIVE. */
  private loadMembers(groupId: string): void {
    this.groupsService.findMembers(groupId).subscribe({
      next: (members) => this.groupMembers.set(members),
      error: () => this.groupMembers.set(null),
    });
  }

  private loadPendingPayments(groupId: string): void {
    if (!this.isOwner()) {
      return;
    }
    this.paymentsService.findPending(groupId).subscribe({
      next: (res) => this.pendingPayments.set(res.data),
      error: () => this.pendingPayments.set([]),
    });
  }

  /** Vista previa dentro de la página (imagen o PDF embebido) en vez de abrir una pestaña nueva. */
  protected viewReceipt(payment: PendingPayment): void {
    const group = this.group();
    if (!group || this.viewingReceiptId()) {
      return;
    }
    this.viewingReceiptId.set(payment.id);
    this.paymentsService.getReceiptBlob(group.id, payment.id).subscribe({
      next: (blob) => {
        this.viewingReceiptId.set(null);
        this.receiptPreviewIsPdf.set(blob.type === 'application/pdf');
        this.receiptPreviewUrl.set(URL.createObjectURL(blob));
      },
      error: () => this.viewingReceiptId.set(null),
    });
  }

  protected closeReceiptPreview(): void {
    const url = this.receiptPreviewUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.receiptPreviewUrl.set(null);
  }

  protected selectProfileForPayment(paymentId: string, profileId: string): void {
    this.selectedProfileByPayment.update((map) => ({ ...map, [paymentId]: profileId }));
  }

  protected approvePayment(payment: PendingPayment): void {
    const group = this.group();
    if (!group || this.reviewingId()) {
      return;
    }
    const needsProfile = payment.membershipStatus === 'PENDING_PAYMENT';
    const profileId = this.selectedProfileByPayment()[payment.id];
    if (needsProfile && !profileId) {
      this.errorMessageForOwnerReview.set('Elige qué perfil de la cuenta le vas a asignar antes de aprobar.');
      return;
    }
    this.reviewingId.set(payment.id);
    this.errorMessageForOwnerReview.set(null);
    this.paymentsService.review(group.id, payment.id, true, undefined, needsProfile ? profileId : undefined).subscribe({
      next: () => {
        this.reviewingId.set(null);
        this.pendingPayments.update((list) => (list ?? []).filter((p) => p.id !== payment.id));
        // El miembro pasó de PENDING_PAYMENT a ACTIVE en el backend — refresca la lista para
        // que deje de decir "Esperando pago" con la fecha real de ingreso, y su perfil quedó asignado.
        this.loadMembers(group.id);
        this.loadProfiles(group.id);
      },
      error: (message: string) => {
        this.reviewingId.set(null);
        this.errorMessageForOwnerReview.set(message);
      },
    });
  }

  protected addProfile(): void {
    const group = this.group();
    const label = this.newProfileLabel().trim();
    if (!group || !label || this.savingProfile()) {
      return;
    }
    this.savingProfile.set(true);
    this.profileError.set(null);
    this.groupsService.createProfile(group.id, label).subscribe({
      next: (profile) => {
        this.savingProfile.set(false);
        this.newProfileLabel.set('');
        this.profiles.update((list) => [...(list ?? []), profile]);
      },
      error: (message: string) => {
        this.savingProfile.set(false);
        this.profileError.set(message);
      },
    });
  }

  protected startRenameProfile(profile: GroupProfile): void {
    this.renamingProfileId.set(profile.id);
    this.renameLabel.set(profile.label);
  }

  protected cancelRenameProfile(): void {
    this.renamingProfileId.set(null);
  }

  protected saveRenameProfile(profile: GroupProfile): void {
    const group = this.group();
    const label = this.renameLabel().trim();
    if (!group || !label || this.savingProfile()) {
      return;
    }
    this.savingProfile.set(true);
    this.profileError.set(null);
    this.groupsService.renameProfile(group.id, profile.id, label).subscribe({
      next: (updated) => {
        this.savingProfile.set(false);
        this.renamingProfileId.set(null);
        this.profiles.update((list) => (list ?? []).map((p) => (p.id === updated.id ? updated : p)));
      },
      error: (message: string) => {
        this.savingProfile.set(false);
        this.profileError.set(message);
      },
    });
  }

  protected removeProfile(profile: GroupProfile): void {
    const group = this.group();
    if (!group || profile.assignedTo || this.deletingProfileId()) {
      return;
    }
    this.deletingProfileId.set(profile.id);
    this.profileError.set(null);
    this.groupsService.deleteProfile(group.id, profile.id).subscribe({
      next: () => {
        this.deletingProfileId.set(null);
        this.profiles.update((list) => (list ?? []).filter((p) => p.id !== profile.id));
      },
      error: (message: string) => {
        this.deletingProfileId.set(null);
        this.profileError.set(message);
      },
    });
  }

  protected startReject(paymentId: string): void {
    this.rejectingId.set(paymentId);
    this.rejectReason.set('');
  }

  protected cancelReject(): void {
    this.rejectingId.set(null);
  }

  protected confirmReject(payment: PendingPayment): void {
    const group = this.group();
    if (!group || this.reviewingId()) {
      return;
    }
    this.reviewingId.set(payment.id);
    this.paymentsService.review(group.id, payment.id, false, this.rejectReason().trim() || undefined).subscribe({
      next: () => {
        this.reviewingId.set(null);
        this.rejectingId.set(null);
        this.pendingPayments.update((list) =>
          (list ?? []).map((p) => (p.id === payment.id ? { ...p, receiptUploadedAt: null } : p)),
        );
      },
      error: (message: string) => {
        this.reviewingId.set(null);
        this.errorMessageForOwnerReview.set(message);
      },
    });
  }

  /**
   * El backend permite ver la credencial al owner o a un miembro ACTIVO — usamos ese mismo
   * resultado para saber si el visitante ya es miembro (incluso si recargó la página y no viene
   * del flujo de "join" en esta sesión), sin necesitar un endpoint aparte para eso.
   */
  private loadCredential(groupId: string): void {
    this.credentialsService.get(groupId).subscribe({
      next: (cred) => {
        this.credential.set(cred);
        if (!this.isOwner()) {
          this.joined.set(true);
        }
      },
      error: () => this.credentialAccessDenied.set(true),
    });
  }

  protected openCredentialForm(): void {
    const g = this.group();
    if (g && this.isOwner() && g.approvalStatus === 'PENDING' && g.credentialReviewStatus === 'NOT_REQUESTED') {
      return;
    }
    const cred = this.credential();
    this.credUsername.set(cred?.username ?? '');
    this.credPassword.set(cred?.password ?? '');
    this.credNotes.set(cred?.notes ?? '');
    this.credentialSaveError.set(null);
    this.credentialFormOpen.set(true);
  }

  protected closeCredentialForm(): void {
    this.credentialFormOpen.set(false);
  }

  protected saveCredential(): void {
    const group = this.group();
    const username = this.credUsername().trim();
    const password = this.credPassword();
    if (!group || this.savingCredential() || !username || !password) {
      return;
    }
    this.savingCredential.set(true);
    this.credentialSaveError.set(null);
    this.credentialsService
      .upsert(group.id, {
        username,
        password,
        notes: this.credNotes().trim() || undefined,
        changeReason: group.approvalStatus === 'PENDING' ? 'Enviadas al administrador para revisión' : 'Actualización del acceso',
      })
      .subscribe({
        next: (cred) => {
          this.savingCredential.set(false);
          this.credential.set(cred);
          this.credentialFormOpen.set(false);
          if (group.approvalStatus === 'PENDING') {
            this.group.set({ ...group, hasCredentials: true, credentialReviewStatus: 'SUBMITTED', credentialsSubmittedAt: new Date().toISOString() });
            this.credentialSent.set(true);
            setTimeout(() => this.credentialSent.set(false), 3500);
          }
        },
        error: (message: string) => {
          this.savingCredential.set(false);
          this.credentialSaveError.set(message);
        },
      });
  }

  protected togglePasswordVisibility(): void {
    this.showCredentialPassword.update((v) => !v);
  }

  protected copyToClipboard(text: string, field: 'username' | 'password'): void {
    navigator.clipboard?.writeText(text).then(() => {
      this.copiedField.set(field);
      setTimeout(() => this.copiedField.set(null), 1500);
    });
  }

  private loadReviews(groupId: string): void {
    this.reviewsService.findByGroup(groupId, 1, 20).subscribe({
      next: (res) => {
        this.reviews.set(res.data);
        this.reviewsTotal.set(res.total);
      },
      error: () => this.reviews.set([]),
    });
  }

  private loadOtherGroups(ownerId: string, excludeGroupId: string): void {
    this.groupsService.findAvailable(1, 6, undefined, ownerId).subscribe({
      next: (res) => {
        this.otherGroups.set(res.data.filter((g) => g.id !== excludeGroupId));
        this.otherGroupsTotal.set(res.total);
      },
      error: () => {
        this.otherGroups.set([]);
        this.otherGroupsTotal.set(0);
      },
    });
  }

  /** Grupos activos (buscando miembros) que administra este vendedor, incluyendo el actual. */
  protected readonly activeGroupsCount = computed(() => this.otherGroupsTotal() + 1);

  /** Agrupa las reseñas en páginas de `reviewsPerPage` para deslizar el carrusel una página a la vez. */
  protected readonly reviewPages = computed(() => {
    const all = this.reviews();
    if (!all) {
      return [];
    }
    const pages: Review[][] = [];
    for (let i = 0; i < all.length; i += this.reviewsPerPage) {
      pages.push(all.slice(i, i + this.reviewsPerPage));
    }
    return pages.length > 0 ? pages : [[]];
  });

  protected readonly reviewsPageCount = computed(() => this.reviewPages().length);

  protected prevReviewsPage(): void {
    this.reviewsPageIndex.update((i) => Math.max(0, i - 1));
  }

  protected nextReviewsPage(): void {
    this.reviewsPageIndex.update((i) => Math.min(this.reviewsPageCount() - 1, i + 1));
  }

  protected toggleShowAllReviews(): void {
    this.showAllReviews.update((v) => !v);
    this.reviewsPageIndex.set(0);
  }

  private readonly monthsEs = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sep',
    'oct',
    'nov',
    'dic',
  ];

  protected memberSinceLabel(iso: string): string {
    const date = new Date(iso);
    return `${this.monthsEs[date.getMonth()]} ${date.getFullYear()}`;
  }

  /** Fechas de renovación: día de calendario a medianoche UTC, se muestran en UTC para no atrasar un día. */
  protected calendarDateLabel(iso: string): string {
    const date = new Date(iso);
    return `${date.getUTCDate()} ${this.monthsEs[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  }

  protected paymentDateLabel(iso: string): string {
    const date = new Date(iso);
    return `${date.getDate()} ${this.monthsEs[date.getMonth()]} ${date.getFullYear()}`;
  }

  protected relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) {
      return 'Hoy';
    }
    if (diffDays === 1) {
      return 'Hace 1 día';
    }
    if (diffDays < 7) {
      return `Hace ${diffDays} días`;
    }
    const weeks = Math.floor(diffDays / 7);
    if (weeks < 5) {
      return `Hace ${weeks} semana${weeks === 1 ? '' : 's'}`;
    }
    const months = Math.floor(diffDays / 30);
    if (months < 12) {
      return `Hace ${months} mes${months === 1 ? '' : 'es'}`;
    }
    const years = Math.floor(diffDays / 365);
    return `Hace ${years} año${years === 1 ? '' : 's'}`;
  }

  protected toggleProfileMenu(profileId: string): void {
    this.openProfileMenuId.update((current) => (current === profileId ? null : profileId));
  }

  protected closeProfileMenu(): void {
    this.openProfileMenuId.set(null);
  }

  protected toggleMemberMenu(membershipId: string): void {
    this.openMemberMenuId.update((current) => (current === membershipId ? null : membershipId));
  }

  protected closeMemberMenu(): void {
    this.openMemberMenuId.set(null);
  }

  protected async removeMemberAction(member: Membership): Promise<void> {
    const group = this.group();
    if (!group || this.removingMemberId()) {
      return;
    }
    this.closeMemberMenu();
    const ok = await this.confirmService.ask({
      title: `¿Sacar a ${member.user.name} del grupo?`,
      text: 'Se liberará su cupo.',
      confirmText: 'Sí, sacar',
      danger: true,
    });
    if (!ok) {
      return;
    }
    this.removingMemberId.set(member.id);
    this.memberActionError.set(null);
    this.groupsService.removeMember(group.id, member.id).subscribe({
      next: () => {
        this.removingMemberId.set(null);
        this.groupMembers.update((list) => (list ?? []).filter((m) => m.id !== member.id));
        this.group.update((g) => (g ? { ...g, occupiedSlots: Math.max(0, g.occupiedSlots - 1), status: g.status === 'FULL' ? 'SEARCHING_MEMBERS' : g.status } : g));
      },
      error: (message: string) => {
        this.removingMemberId.set(null);
        this.memberActionError.set(message);
      },
    });
  }

  /** Copia el enlace público de este grupo para que el owner lo comparta fuera de Partly. */
  protected shareGroupLink(): void {
    const group = this.group();
    if (!group) {
      return;
    }
    const url = `${location.origin}/panel/grupos/${group.id}`;
    navigator.clipboard?.writeText(url).then(() => {
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 2000);
    });
  }

  /** Fotos de perfil que no cargaron (p. ej. de Google): se muestra la inicial en su lugar. */
  protected readonly brokenAvatars = signal<ReadonlySet<string>>(new Set());

  protected markAvatarBroken(url: string): void {
    this.brokenAvatars.update((set) => new Set(set).add(url));
  }

  protected readonly emojiOpen = signal(false);
  protected readonly reviewEmojis = ['😀', '😍', '👍', '🙌', '🔥', '⭐', '💯', '🙏'];
  /** Frases rápidas: al tocarlas se agregan (o se quitan) del comentario. */
  protected readonly reviewTags = ['Todo bien', 'Sin problemas', 'Buena comunicación', 'Recomendado', 'Excelente servicio', 'Volvería a unirme'];

  protected hasReviewTag(tag: string): boolean {
    return this.reviewCommentDraft().toLowerCase().includes(tag.toLowerCase());
  }

  protected toggleReviewTag(tag: string): void {
    const current = this.reviewCommentDraft();
    const index = current.toLowerCase().indexOf(tag.toLowerCase());
    if (index >= 0) {
      const cleaned = (current.slice(0, index) + current.slice(index + tag.length)).replace(/\s{2,}/g, ' ').replace(/^[\s.,]+/, '').trim();
      this.reviewCommentDraft.set(cleaned);
      return;
    }
    const base = current.trim().replace(/[.,]$/, '');
    this.reviewCommentDraft.set((base ? `${base}. ${tag}` : tag).slice(0, 500));
  }

  protected addReviewEmoji(emoji: string): void {
    this.reviewCommentDraft.set((this.reviewCommentDraft() + emoji).slice(0, 500));
    this.emojiOpen.set(false);
  }

  protected openReply(review: Review): void {
    this.replyingId.set(review.id);
    this.replyDraft.set(review.sellerReply ?? '');
    this.replyError.set(null);
  }

  protected submitReply(review: Review): void {
    const group = this.group();
    const text = this.replyDraft().trim();
    if (!group || this.savingReply() || text.length < 2) {
      return;
    }
    this.savingReply.set(true);
    this.replyError.set(null);
    this.reviewsService.reply(group.id, review.id, text).subscribe({
      next: (updated) => {
        this.savingReply.set(false);
        this.replyingId.set(null);
        this.reviews.update((list) => (list ?? []).map((r) => (r.id === updated.id ? updated : r)));
      },
      error: (message: string) => {
        this.savingReply.set(false);
        this.replyError.set(message);
      },
    });
  }

  protected openReviewForm(): void {
    const existing = this.myReview();
    this.reviewRatingDraft.set(existing?.rating ?? 5);
    this.reviewCommentDraft.set(existing?.comment ?? '');
    this.reviewSaveError.set(null);
    this.emojiOpen.set(false);
    this.reviewFormOpen.set(true);
  }

  protected closeReviewForm(): void {
    this.reviewFormOpen.set(false);
  }

  protected submitReview(): void {
    const group = this.group();
    if (!group || this.savingReview()) {
      return;
    }
    this.savingReview.set(true);
    this.reviewSaveError.set(null);
    this.reviewsService.upsert(group.id, this.reviewRatingDraft(), this.reviewCommentDraft().trim() || undefined).subscribe({
      next: (review) => {
        this.savingReview.set(false);
        this.reviewFormOpen.set(false);
        this.reviews.update((list) => {
          const others = (list ?? []).filter((r) => r.id !== review.id);
          return [review, ...others];
        });
        this.reviewsTotal.update((total) => (this.myReview() ? total : total + 1));
      },
      error: (message: string) => {
        this.savingReview.set(false);
        this.reviewSaveError.set(message);
      },
    });
  }

  protected async deleteReview(): Promise<void> {
    const group = this.group();
    if (!group || this.deletingReview()) {
      return;
    }
    const ok = await this.confirmService.ask({ title: '¿Eliminar tu reseña?', text: 'Se quitará de este grupo.', confirmText: 'Sí, eliminar', danger: true });
    if (!ok) {
      return;
    }
    this.deletingReview.set(true);
    this.reviewsService.remove(group.id).subscribe({
      next: () => {
        this.deletingReview.set(false);
        const mine = this.myReview();
        this.reviews.update((list) => (list ?? []).filter((r) => r.id !== mine?.id));
        this.reviewsTotal.update((total) => Math.max(0, total - 1));
      },
      error: () => {
        this.deletingReview.set(false);
      },
    });
  }

  protected join(): void {
    const group = this.group();
    if (!group || this.joining()) {
      return;
    }
    this.joining.set(true);
    this.joinError.set(null);
    this.groupsService.join(group.id).subscribe({
      next: (membership) => {
        this.joining.set(false);
        if (membership.status === 'RESERVED') {
          // El grupo todavía no inicia: solo se reservó el cupo y no hay nada que pagar. Ir a /pago
          // dejaba la pantalla cargando sin fin (ese pago no existe hasta que el vendedor inicie).
          this.reserved.set(true);
          return;
        }
        this.router.navigate(['/panel/grupos', group.id, 'pago']);
      },
      error: (message: string) => {
        this.joining.set(false);
        this.joinError.set(message);
      },
    });
  }
}
