import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IncidentsService } from '../../shared/incidents.service';
import { AuthService } from '../../shared/auth.service';
import { ConfirmService } from '../../shared/confirm.service';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';
import { Incident, IncidentMessage, IncidentStatus } from '../../shared/incidents.models';

/** Texto sugerido cuando el responsable avisa que ya lo arregló (el reportante confirma y cierra). */
const FIXED_MESSAGE = 'Listo, ya lo revisé y quedó arreglado. ¿Me confirmas que ya te funciona?';

/**
 * Detalle de una incidencia. Cada quien ve lo suyo: quien reportó (normalmente el comprador) espera respuesta,
 * confirma que ya quedó o pide ayuda a Tequio; el responsable (el vendedor) responde, tiene a la mano actualizar las
 * credenciales de su grupo y avisa "ya lo arreglé", pero no puede cerrar el reporte por su cuenta.
 */
@Component({
  imports: [RouterLink, PlatformLogo],
  selector: 'app-support-detail',
  templateUrl: './support-detail.html',
})
export class SupportDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly incidentsService = inject(IncidentsService);
  private readonly confirmService = inject(ConfirmService);
  protected readonly authService = inject(AuthService);

  private readonly replyBox = viewChild<ElementRef<HTMLTextAreaElement>>('replyBox');

  protected readonly incident = signal<Incident | null>(null);
  protected readonly messages = signal<IncidentMessage[] | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly reply = signal('');
  /** Enviar el siguiente mensaje solo a Tequio (la otra persona no lo ve). */
  protected readonly privateToPartly = signal(false);
  protected readonly sending = signal(false);
  protected readonly updatingStatus = signal(false);

  private readonly myId = computed(() => this.authService.currentUser()?.id ?? null);
  /** Quien reportó (el comprador, o el vendedor en una compra de mayoreo). */
  protected readonly isReporter = computed(() => this.incident()?.reportedBy.id === this.myId());
  /** Quien debe responder (el vendedor del grupo, o Tequio en el mayoreo). */
  protected readonly isAssignee = computed(() => this.incident()?.assignedTo.id === this.myId());
  /** Reporte de una compra al mayoreo: lo atiende el equipo de Tequio (ya no tiene caso "pedir ayuda a Tequio"). */
  protected readonly isWholesale = computed(() => this.incident()?.about?.kind === 'WHOLESALE');
  /** Cómo se nombra a quien atiende: el vendedor por su nombre, o "Tequio" en el mayoreo. */
  protected readonly responsibleName = computed(() => {
    const inc = this.incident();
    if (!inc) return '';
    return this.isWholesale() ? 'el equipo de Tequio' : this.firstName(inc.assignedTo.name);
  });
  /** Tequio ya intervino (escalada o pidió respuesta): se le puede escribir en privado. */
  protected readonly partlyInvolved = computed(() => {
    const inc = this.incident();
    return !!inc && !this.isWholesale() && (inc.status === 'ESCALATED' || inc.responseRequestedAt !== null);
  });
  protected readonly isOpenForActions = computed(() => {
    const status = this.incident()?.status;
    return status === 'OPEN' || status === 'IN_REVIEW';
  });

  private get incidentId(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loadIncident();
    this.incidentsService.findMessages(this.incidentId).subscribe({
      next: (messages) => this.messages.set(messages),
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  private loadIncident(): void {
    this.incidentsService.findOne(this.incidentId).subscribe({
      next: (incident) => this.incident.set(incident),
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  protected sendReply(): void {
    const body = this.reply().trim();
    if (!body || this.sending()) {
      return;
    }
    this.sending.set(true);
    const audience = this.privateToPartly() && this.partlyInvolved() ? (this.isReporter() ? 'REPORTER' : 'ASSIGNEE') : 'ALL';
    this.incidentsService.addMessage(this.incidentId, body, audience).subscribe({
      next: (message) => {
        this.sending.set(false);
        this.reply.set('');
        this.privateToPartly.set(false);
        this.messages.update((list) => [...(list ?? []), message]);
        // La primera respuesta del responsable la pasa a "en revisión".
        this.loadIncident();
      },
      error: (msg: string) => {
        this.sending.set(false);
        this.errorMessage.set(msg);
      },
    });
  }

  /** "Ya lo arreglé": deja escrito el aviso para que quien reportó confirme; el responsable puede ajustarlo. */
  protected prepareFixedMessage(): void {
    this.reply.set(FIXED_MESSAGE);
    const box = this.replyBox()?.nativeElement;
    box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    box?.focus();
  }

  protected async resolve(): Promise<void> {
    const ok = await this.confirmService.ask({
      title: '¿Ya quedó?',
      text: 'Se cierra el reporte y ya no se pueden enviar mensajes. Si vuelve a fallar, puedes abrir uno nuevo.',
      confirmText: 'Sí, ya quedó',
      cancelText: 'Todavía no',
    });
    if (ok) this.setStatus('RESOLVED');
  }

  protected async escalate(): Promise<void> {
    const inc = this.incident();
    if (!inc) return;
    const other = this.isReporter() ? inc.assignedTo.name : inc.reportedBy.name;
    const ok = await this.confirmService.ask({
      title: '¿Pedir ayuda a Tequio?',
      text: `El equipo de Tequio revisará la conversación con ${other} y decidirá cómo resolverlo. Desde ese momento solo Tequio puede cerrar el reporte. Úsalo si no se ponen de acuerdo o no hay respuesta.`,
      confirmText: 'Sí, pedir ayuda',
      cancelText: 'Volver',
    });
    if (ok) this.setStatus('ESCALATED');
  }

  private setStatus(status: IncidentStatus): void {
    if (this.updatingStatus()) {
      return;
    }
    this.updatingStatus.set(true);
    this.errorMessage.set(null);
    this.incidentsService.updateStatus(this.incidentId, status).subscribe({
      next: (incident) => {
        this.updatingStatus.set(false);
        this.incident.set(incident);
      },
      error: (message: string) => {
        this.updatingStatus.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected statusLabel(status: IncidentStatus): string {
    return { OPEN: 'Abierta', IN_REVIEW: 'En revisión', RESOLVED: 'Resuelta', ESCALATED: 'Escalada a Tequio' }[status];
  }

  protected statusPill(status: IncidentStatus): string {
    return { OPEN: 'ui-pill--warn', IN_REVIEW: 'ui-pill--info', RESOLVED: 'ui-pill--ok', ESCALATED: 'ui-pill--danger' }[status];
  }

  protected firstName(name: string): string {
    return name.trim().split(/\s+/)[0];
  }

  protected formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value)).replace(/\./g, '');
  }
}
