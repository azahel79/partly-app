import { periodAdjective, periodNoun } from '../../shared/billing-period.util';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { GroupsService } from '../../shared/groups.service';
import { AdminGroupDetail as AdminGroupDetailModel, GroupStatus } from '../../shared/groups.models';
import { CredentialsService } from '../../shared/credentials.service';
import { Credential } from '../../shared/credentials.models';
import { PaymentsService } from '../../shared/payments.service';
import { AdminPayment } from '../../shared/payments.models';
import { Membership } from '../../shared/memberships.models';
import { platformLogoSrc } from '../../shared/platform-logo.util';
import { PlanFeature, planFeatures } from '../../shared/plan-features.util';
import { MoneyPipe } from '../../shared/money';

/** Rango de comisión que la app permite fijar por grupo (debe coincidir con el backend). */

const MEMBERSHIP_STATUS_LABEL: Record<Membership['status'], string> = {
  RESERVED: 'Cupo reservado',
  ACTIVE: 'Activo',
  PENDING_PAYMENT: 'Esperando pago',
  SUSPENDED: 'Suspendido (gracia)',
  CANCELLED: 'Cancelado',
};

const PAYMENT_STATUS_LABEL: Record<AdminPayment['status'], string> = {
  PENDING: 'Pendiente',
  PAID: 'Aprobado',
  FAILED: 'Vencido / rechazado',
};


const GROUP_STATUS_LABEL: Record<GroupStatus, string> = {
  SEARCHING_MEMBERS: 'Buscando miembros',
  READY_TO_START: 'Listo para iniciar',
  ACTIVE: 'Activo',
  FULL: 'Grupo lleno',
  PAUSED: 'Pausado',
  CANCELLED: 'Cancelado',
};

interface PlatformBrand {
  logoUrl: string | null;
  background: string;
  accent: string;
  description: string;
}

const KNOWN_BRANDS: Record<string, Omit<PlatformBrand, 'logoUrl'> & { slug: string }> = {
  netflix: { slug: 'netflix', background: 'linear-gradient(118deg,#070b19 0%,#16080c 62%,#4a0710 100%)', accent: '#e50914', description: 'Series, películas y entretenimiento para todos.' },
  spotify: { slug: 'spotify', background: 'linear-gradient(118deg,#071b13 0%,#0b3926 58%,#1db954 145%)', accent: '#1db954', description: 'Música, podcasts y audio sin límites.' },
  'disney+': { slug: 'disneyplus', background: 'linear-gradient(118deg,#07152f 0%,#082c66 64%,#1164ca 125%)', accent: '#79baff', description: 'Más historias, más aventuras y más entretenimiento.' },
  disney: { slug: 'disneyplus', background: 'linear-gradient(118deg,#07152f 0%,#082c66 64%,#1164ca 125%)', accent: '#79baff', description: 'Más historias, más aventuras y más entretenimiento.' },
  max: { slug: 'max', background: 'linear-gradient(118deg,#090c29 0%,#25145e 62%,#5947ff 130%)', accent: '#8a79ff', description: 'Grandes historias, series y películas.' },
  'hbo max': { slug: 'max', background: 'linear-gradient(118deg,#090c29 0%,#25145e 62%,#5947ff 130%)', accent: '#8a79ff', description: 'Grandes historias, series y películas.' },
  youtube: { slug: 'youtube', background: 'linear-gradient(118deg,#100b0d 0%,#351013 62%,#ff0033 145%)', accent: '#ff0033', description: 'Videos y música sin interrupciones.' },
  'youtube premium': { slug: 'youtube', background: 'linear-gradient(118deg,#100b0d 0%,#351013 62%,#ff0033 145%)', accent: '#ff0033', description: 'Videos y música sin interrupciones.' },
  canva: { slug: 'canva', background: 'linear-gradient(118deg,#062731 0%,#07566b 62%,#00c4cc 145%)', accent: '#44e0dd', description: 'Diseña, crea y colabora desde cualquier lugar.' },
  crunchyroll: { slug: 'crunchyroll', background: 'linear-gradient(118deg,#22130a 0%,#54250b 62%,#f47521 145%)', accent: '#f47521', description: 'Anime, estrenos y entretenimiento japonés.' },
  'chatgpt plus': { slug: 'openai', background: 'linear-gradient(118deg,#081a18 0%,#12332d 62%,#10a37f 145%)', accent: '#4fd1b5', description: 'Herramientas avanzadas de inteligencia artificial.' },
  'paramount+': { slug: 'paramountplus', background: 'linear-gradient(118deg,#061633 0%,#073b82 62%,#0064ff 145%)', accent: '#67a2ff', description: 'Películas, series y producciones originales.' },
  notion: { slug: 'notion', background: 'linear-gradient(118deg,#111318 0%,#2e3138 100%)', accent: '#ffffff', description: 'Organiza tus proyectos, documentos y equipos.' },
};

@Component({
  imports: [RouterLink, MoneyPipe],
  selector: 'app-admin-group-detail',
  styleUrl: './group-detail.css',
  templateUrl: './group-detail.html',
})
export class AdminGroupDetail implements OnInit {
  protected readonly periodNoun = periodNoun;
  protected readonly periodAdjective = periodAdjective;
  private readonly route = inject(ActivatedRoute);
  private readonly groupsService = inject(GroupsService);
  private readonly credentialsService = inject(CredentialsService);
  private readonly paymentsService = inject(PaymentsService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly group = signal<AdminGroupDetailModel | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly working = signal(false);

  protected readonly rejecting = signal(false);
  protected readonly rejectReason = signal('');

  private breakdown(pct: number) {
    const g = this.group();
    if (!g) {
      return null;
    }
    const gross = Number(g.pricePerSlot) * g.availableSlots;
    const commission = Math.round(gross * (pct / 100) * 100) / 100;
    return { gross, commission, net: Math.round((gross - commission) * 100) / 100 };
  }

  /** La comisión es fija (9% o la reducida del vendedor): aquí solo se muestra cuánto recibe el vendedor con el grupo lleno. */
  protected readonly commissionPreview = computed(() => {
    const pct = Number(this.group()?.commissionPercentage ?? 0);
    return pct > 0 ? { pct, ...this.breakdown(pct)! } : null;
  });


  protected readonly editingInfo = signal(false);
  protected readonly editPrice = signal(0);
  protected readonly editSlots = signal(1);
  protected readonly editBillingDay = signal(1);

  protected readonly notesDraft = signal('');
  protected readonly savingNotes = signal(false);
  protected readonly notesSaved = signal(false);

  protected readonly messaging = signal(false);
  protected readonly messageDraft = signal('');
  protected readonly sendingMessage = signal(false);
  protected readonly messageSent = signal(false);
  protected readonly sentConfirmation = signal('');
  protected readonly requestingCredentials = signal(false);
  protected readonly submittedCredential = signal<Credential | null | undefined>(undefined);
  protected readonly showSubmittedPassword = signal(false);

  protected readonly activeSection = signal<'information' | 'seller' | 'history' | 'activity'>('information');

  protected readonly membershipStatusLabel = MEMBERSHIP_STATUS_LABEL;
  protected readonly paymentStatusLabel = PAYMENT_STATUS_LABEL;
  protected readonly members = signal<Membership[] | null>(null);
  protected readonly activityPayments = signal<AdminPayment[] | null>(null);
  private activityLoaded = false;

  protected readonly viewingReceiptId = signal<string | null>(null);
  protected readonly receiptPreviewUrl = signal<string | null>(null);
  protected readonly receiptPreviewIsPdf = signal(false);
  protected readonly receiptPreviewSafeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.receiptPreviewUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  protected readonly statusBanner = computed(() => {
    const g = this.group();
    if (!g) {
      return null;
    }
    if (g.approvalStatus === 'PENDING') {
      if (g.credentialReviewStatus === 'SUBMITTED') {
        return { tone: 'emerald', icon: 'fact_check', title: 'Credenciales listas para revisar', subtitle: 'Comprueba el acceso antes de aprobar el grupo.' };
      }
      if (g.credentialReviewStatus === 'REQUESTED') {
        return { tone: 'amber', icon: 'key', title: 'Esperando credenciales', subtitle: 'El vendedor ya recibió la solicitud.' };
      }
      return { tone: 'amber', icon: 'schedule', title: 'Pendiente de revisión', subtitle: 'Este grupo aún no ha sido aprobado.' };
    }
    if (g.approvalStatus === 'REJECTED') {
      return { tone: 'red', icon: 'cancel', title: 'Rechazado', subtitle: 'Este grupo no pasó la revisión.' };
    }
    if (!g.hasCredentials) {
      return {
        tone: 'amber',
        icon: 'lock_clock',
        title: 'Aprobado — esperando credenciales',
        subtitle: 'El vendedor debe subir el correo y contraseña antes de que aparezca en el marketplace.',
      };
    }
    return { tone: 'emerald', icon: 'check_circle', title: 'Activo', subtitle: 'Este grupo ya está disponible en el marketplace.' };
  });

  protected readonly planDescription = computed(() => {
    const g = this.group();
    if (!g) {
      return '';
    }
    const period = periodAdjective(g.plan.billingPeriod);
    return `Plan ${g.plan.tierName} de ${g.plan.platform.name}, facturación ${period}. Ofrece ${g.availableSlots} cupos a $${g.pricePerSlot} / ${periodNoun(g.plan.billingPeriod)} cada uno.`;
  });

  protected readonly features = computed<PlanFeature[]>(() => {
    const g = this.group();
    return g ? planFeatures(g.plan.tierName) : [];
  });

  protected readonly brand = computed<PlatformBrand>(() => {
    const platform = this.group()?.plan.platform;
    if (!platform) {
      return { logoUrl: null, background: 'linear-gradient(118deg,#0d1431,#143d58)', accent: '#16b88a', description: '' };
    }
    const key = platform.name.trim().toLowerCase();
    const exact = KNOWN_BRANDS[key] ?? Object.entries(KNOWN_BRANDS).find(([name]) => key.startsWith(name))?.[1];
    if (exact) {
      return { ...exact, logoUrl: platformLogoSrc(platform.name) ?? `https://cdn.simpleicons.org/${exact.slug}/ffffff` };
    }
    return {
      logoUrl: platformLogoSrc(platform.name) ?? platform.logoUrl,
      background: 'linear-gradient(118deg,#0d1431 0%,#123e4a 65%,#079a79 145%)',
      accent: '#35d3a5',
      description: platform.categoryName ? `Servicio de ${platform.categoryName.toLowerCase()}.` : 'Suscripción compartida mediante Tequio.',
    };
  });

  protected readonly reviewStep = computed(() => {
    const g = this.group();
    if (!g || g.approvalStatus === 'REJECTED') return 1;
    if (g.approvalStatus === 'APPROVED') return 3;
    return g.credentialReviewStatus === 'REQUESTED' || g.credentialReviewStatus === 'SUBMITTED' ? 2 : 1;
  });

  private get groupId(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.group.set(null);
    this.groupsService.findAdminDetail(this.groupId).subscribe({
      next: (group) => {
        this.group.set(group);
        this.notesDraft.set(group.internalNotes ?? '');
        this.submittedCredential.set(undefined);
        if (group.credentialReviewStatus === 'SUBMITTED' && group.hasCredentials) {
          this.credentialsService.get(this.groupId).subscribe({
            next: (credential) => this.submittedCredential.set(credential),
            error: (message: string) => {
              this.submittedCredential.set(null);
              this.errorMessage.set(message);
            },
          });
        }
      },
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  protected confirmApprove(): void {
    if (this.working()) {
      return;
    }
    this.working.set(true);
    this.groupsService.reviewApproval(this.groupId, 'APPROVED').subscribe({
      next: () => {
        this.working.set(false);
        this.load();
      },
      error: (message: string) => {
        this.working.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected startReject(): void {
    this.rejecting.set(true);
    this.rejectReason.set('');
  }

  protected cancelReject(): void {
    this.rejecting.set(false);
    this.rejectReason.set('');
  }

  protected confirmReject(): void {
    const reason = this.rejectReason().trim();
    if (!reason || this.working()) {
      return;
    }
    this.working.set(true);
    this.groupsService.reviewApproval(this.groupId, 'REJECTED', reason).subscribe({
      next: () => {
        this.working.set(false);
        this.cancelReject();
        this.load();
      },
      error: (message: string) => {
        this.working.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected setBusinessStatus(status: Extract<GroupStatus, 'SEARCHING_MEMBERS' | 'PAUSED' | 'CANCELLED'>): void {
    if (this.working()) {
      return;
    }
    this.working.set(true);
    this.groupsService.setStatus(this.groupId, status).subscribe({
      next: () => {
        this.working.set(false);
        this.load();
      },
      error: (message: string) => {
        this.working.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected startEditInfo(): void {
    const g = this.group();
    if (!g) {
      return;
    }
    this.editPrice.set(Number(g.pricePerSlot));
    this.editSlots.set(g.availableSlots);
    this.editBillingDay.set(g.billingDay);
    this.editingInfo.set(true);
  }

  protected cancelEditInfo(): void {
    this.editingInfo.set(false);
  }

  protected saveEditInfo(): void {
    if (this.working()) {
      return;
    }
    this.working.set(true);
    this.groupsService
      .updateGroup(this.groupId, {
        pricePerSlot: this.editPrice(),
        availableSlots: this.editSlots(),
        billingDay: this.editBillingDay(),
      })
      .subscribe({
        next: () => {
          this.working.set(false);
          this.editingInfo.set(false);
          this.load();
        },
        error: (message: string) => {
          this.working.set(false);
          this.errorMessage.set(message);
        },
      });
  }

  protected saveNotes(): void {
    if (this.savingNotes()) {
      return;
    }
    this.savingNotes.set(true);
    this.notesSaved.set(false);
    this.groupsService.updateAdminNotes(this.groupId, this.notesDraft()).subscribe({
      next: () => {
        this.savingNotes.set(false);
        this.notesSaved.set(true);
        setTimeout(() => this.notesSaved.set(false), 2500);
      },
      error: (message: string) => {
        this.savingNotes.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected requestCredentials(): void {
    if (this.requestingCredentials()) {
      return;
    }
    this.requestingCredentials.set(true);
    this.groupsService.requestCredentials(this.groupId).subscribe({
        next: () => {
          this.requestingCredentials.set(false);
          this.sentConfirmation.set('Solicitud de credenciales enviada al vendedor.');
          this.messageSent.set(true);
          this.load();
          setTimeout(() => this.messageSent.set(false), 2500);
        },
        error: (message: string) => {
          this.requestingCredentials.set(false);
          this.errorMessage.set(message);
        },
      });
  }

  protected groupStatusLabel(status: GroupStatus): string {
    return GROUP_STATUS_LABEL[status];
  }

  protected selectSection(section: 'information' | 'seller' | 'history' | 'activity'): void {
    this.activeSection.set(section);
    if (section === 'activity' && !this.activityLoaded) {
      this.activityLoaded = true;
      this.loadActivity();
    }
  }

  /** Miembros y pagos reales del grupo — pestaña "Movimientos", cargada solo la primera vez que se abre. */
  private loadActivity(): void {
    this.groupsService.findMembers(this.groupId).subscribe({
      next: (members) => this.members.set(members),
      error: () => this.members.set([]),
    });
    this.paymentsService.findAllForAdmin('', '', 1, 100, this.groupId).subscribe({
      next: (res) => this.activityPayments.set(res.data),
      error: () => this.activityPayments.set([]),
    });
  }

  /** Vista previa dentro de la página (imagen o PDF embebido), igual que en el panel del vendedor. */
  protected viewReceipt(paymentId: string): void {
    if (this.viewingReceiptId()) {
      return;
    }
    this.viewingReceiptId.set(paymentId);
    this.paymentsService.getReceiptBlob(this.groupId, paymentId).subscribe({
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

  protected hideBrokenImage(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  protected toggleSubmittedPassword(): void {
    this.showSubmittedPassword.update((visible) => !visible);
  }

  protected startMessage(): void {
    this.messaging.set(true);
    this.messageDraft.set('');
    this.messageSent.set(false);
    this.sentConfirmation.set('');
  }

  protected cancelMessage(): void {
    this.messaging.set(false);
    this.messageDraft.set('');
  }

  protected sendMessage(): void {
    const message = this.messageDraft().trim();
    if (!message || this.sendingMessage()) {
      return;
    }
    this.sendingMessage.set(true);
    this.groupsService.sendMessageToSeller(this.groupId, message).subscribe({
      next: () => {
        this.sendingMessage.set(false);
        this.messaging.set(false);
        this.messageDraft.set('');
        this.sentConfirmation.set('Mensaje enviado al vendedor.');
        this.messageSent.set(true);
        setTimeout(() => this.messageSent.set(false), 2500);
      },
      error: (message: string) => {
        this.sendingMessage.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  /** Renovación: día de calendario a medianoche UTC. */
  protected formatCalendarDate(value: string): string {
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
  }
}
