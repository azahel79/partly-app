import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { IncidentsService } from '../../shared/incidents.service';
import { ConfirmService } from '../../shared/confirm.service';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';
import { Incident, IncidentMessage, IncidentMessageAudience, IncidentStatus } from '../../shared/incidents.models';
import { ProviderOrdersService } from '../../shared/provider-orders.service';
import { ProviderOrder } from '../../shared/provider-orders.models';
import { DeliverCredentialsModal } from '../deliver-credentials-modal/deliver-credentials-modal';

/** Lo que el admin puede hacer desde cada estado (mismas transiciones que valida el servidor). */
const ADMIN_ACTIONS: Record<IncidentStatus, { status: IncidentStatus; label: string; icon: string; tone: 'primary' | 'secondary' | 'danger' }[]> = {
  OPEN: [
    { status: 'RESOLVED', label: 'Marcar como resuelta', icon: 'check', tone: 'primary' },
    { status: 'ESCALATED', label: 'Tomarla (escalar a Partly)', icon: 'shield_person', tone: 'secondary' },
  ],
  IN_REVIEW: [
    { status: 'RESOLVED', label: 'Marcar como resuelta', icon: 'check', tone: 'primary' },
    { status: 'ESCALATED', label: 'Tomarla (escalar a Partly)', icon: 'shield_person', tone: 'secondary' },
  ],
  ESCALATED: [
    { status: 'RESOLVED', label: 'Marcar como resuelta', icon: 'check', tone: 'primary' },
    { status: 'IN_REVIEW', label: 'Regresarla al responsable', icon: 'undo', tone: 'secondary' },
  ],
  RESOLVED: [],
};

@Component({
  imports: [RouterLink, PlatformLogo, DeliverCredentialsModal],
  selector: 'app-incident-detail',
  styleUrl: './incident-detail.css',
  templateUrl: './incident-detail.html',
})
export class IncidentDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly incidentsService = inject(IncidentsService);
  private readonly confirmService = inject(ConfirmService);
  private readonly providerOrdersService = inject(ProviderOrdersService);

  protected readonly incident = signal<Incident | null>(null);
  protected readonly messages = signal<IncidentMessage[] | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly sending = signal(false);
  protected readonly updatingStatus = signal(false);
  protected readonly reply = signal('');
  /** A quién va el siguiente mensaje de Partly: a los dos o en privado a una de las partes. */
  protected readonly audience = signal<IncidentMessageAudience>('ALL');
  protected readonly requesting = signal(false);
  /** Compra de Mi tienda cuyo acceso se está corrigiendo desde el reporte. */
  protected readonly updatingOrder = signal<ProviderOrder | null>(null);
  protected readonly loadingOrder = signal(false);

  /** Reporte de una cuenta de Mi tienda (o de un grupo que la usa) con credenciales que administra Partly. */
  protected readonly canFixCredentials = computed(() => {
    const inc = this.incident();
    const about = inc?.about;
    return !!about?.providerOrderId && inc!.status !== 'RESOLVED' && (about.kind === 'WHOLESALE' || about.credentialsManagedByPartly);
  });

  /** En un grupo hay dos personas distintas con quién hablar; en el mayoreo el responsable es Partly. */
  protected readonly canWritePrivately = computed(() => this.incident()?.about?.kind === 'GROUP');

  /** Estado del "Pedir respuesta": pendiente, venció sin respuesta o ya respondió. */
  protected readonly responseState = computed<'pending' | 'overdue' | 'answered' | null>(() => {
    const inc = this.incident();
    if (!inc?.responseRequestedAt) return null;
    if (inc.responseDueAt) return 'pending';
    const replied = inc.lastAssigneeReplyAt && new Date(inc.lastAssigneeReplyAt) >= new Date(inc.responseRequestedAt);
    return replied ? 'answered' : 'overdue';
  });

  protected readonly actions = computed(() => {
    const inc = this.incident();
    return inc ? ADMIN_ACTIONS[inc.status] : [];
  });

  private get incidentId(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    forkJoin({
      incident: this.incidentsService.findOne(this.incidentId),
      messages: this.incidentsService.findMessages(this.incidentId),
    }).subscribe({
      next: ({ incident, messages }) => {
        this.incident.set(incident);
        this.messages.set(messages);
      },
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  protected sendMessage(): void {
    const body = this.reply().trim();
    if (!body || this.sending()) {
      return;
    }
    this.sending.set(true);
    this.incidentsService.addMessage(this.incidentId, body, this.audience()).subscribe({
      next: (message) => {
        this.sending.set(false);
        this.reply.set('');
        this.audience.set('ALL');
        this.messages.update((list) => [...(list ?? []), message]);
      },
      error: (message: string) => {
        this.sending.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected async changeStatus(status: IncidentStatus): Promise<void> {
    const inc = this.incident();
    if (!inc || this.updatingStatus() || status === inc.status) {
      return;
    }
    if (status === 'RESOLVED') {
      const ok = await this.confirmService.ask({
        title: '¿Marcar como resuelta?',
        text: `Se cierra para ${inc.reportedBy.name} y ${inc.assignedTo.name} y ya no se pueden enviar mensajes. Antes de cerrarla, explícales en la conversación qué se decidió.`,
        confirmText: 'Sí, resolver',
        cancelText: 'Volver',
      });
      if (!ok) return;
    }
    this.updatingStatus.set(true);
    this.errorMessage.set(null);
    this.incidentsService.updateStatus(this.incidentId, status).subscribe({
      next: (updated) => {
        this.updatingStatus.set(false);
        this.incident.set(updated);
      },
      error: (message: string) => {
        this.updatingStatus.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected async requestResponse(): Promise<void> {
    const inc = this.incident();
    if (!inc || this.requesting()) return;
    const ok = await this.confirmService.ask({
      title: `¿Pedirle respuesta a ${inc.assignedTo.name}?`,
      text: 'Le llega un aviso y un correo: tiene 24 horas para contestar. Si no lo hace, te avisamos para que decidas con la información que tengas.',
      confirmText: 'Sí, pedir respuesta',
      cancelText: 'Volver',
    });
    if (!ok) return;
    this.requesting.set(true);
    this.errorMessage.set(null);
    this.incidentsService.requestResponse(this.incidentId).subscribe({
      next: (updated) => {
        this.requesting.set(false);
        this.incident.set(updated);
      },
      error: (message: string) => {
        this.requesting.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected openCredentialUpdate(orderId: string): void {
    if (this.loadingOrder()) return;
    this.loadingOrder.set(true);
    this.errorMessage.set(null);
    this.providerOrdersService.findById(orderId).subscribe({
      next: (order) => {
        this.loadingOrder.set(false);
        this.updatingOrder.set(order);
      },
      error: (message: string) => {
        this.loadingOrder.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  /** El servidor ya dejó la respuesta en la conversación y movió el reporte a revisión: se recarga para verlo. */
  protected onCredentialsUpdated(): void {
    this.updatingOrder.set(null);
    this.load();
  }

  /** Etiqueta de un mensaje privado: con quién es. */
  protected privateWith(message: IncidentMessage): string | null {
    const inc = this.incident();
    if (!inc || message.audience === 'ALL') return null;
    return message.audience === 'REPORTER' ? inc.reportedBy.name : inc.assignedTo.name;
  }

  protected statusLabel(status: IncidentStatus): string {
    return { OPEN: 'Abierta', IN_REVIEW: 'En revisión', RESOLVED: 'Resuelta', ESCALATED: 'Escalada a Partly' }[status];
  }

  protected statusPill(status: IncidentStatus): string {
    return { OPEN: 'ui-pill--warn', IN_REVIEW: 'ui-pill--info', RESOLVED: 'ui-pill--ok', ESCALATED: 'ui-pill--danger' }[status];
  }

  /** Quién escribió: el que reportó, el responsable o Partly. */
  protected roleOf(authorId: string): string {
    const inc = this.incident();
    if (!inc) return '';
    if (authorId === inc.reportedBy.id) return 'Reportó';
    if (authorId === inc.assignedTo.id) return 'Responsable';
    return 'Partly';
  }

  protected formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value)).replace(/\./g, '');
  }
}
