import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IncidentsService } from '../../shared/incidents.service';
import { AuthService } from '../../shared/auth.service';
import { Incident, IncidentMessage, IncidentStatus } from '../../shared/incidents.models';

@Component({
  imports: [RouterLink],
  selector: 'app-support-detail',
  templateUrl: './support-detail.html',
})
export class SupportDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly incidentsService = inject(IncidentsService);
  protected readonly authService = inject(AuthService);

  protected readonly incident = signal<Incident | null>(null);
  protected readonly messages = signal<IncidentMessage[] | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly reply = signal('');
  protected readonly sending = signal(false);
  protected readonly updatingStatus = signal(false);

  private get incidentId(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.incidentsService.findOne(this.incidentId).subscribe({
      next: (incident) => this.incident.set(incident),
      error: (message: string) => this.errorMessage.set(message),
    });
    this.incidentsService.findMessages(this.incidentId).subscribe({
      next: (messages) => this.messages.set(messages),
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  protected sendReply(): void {
    const body = this.reply().trim();
    if (!body || this.sending()) {
      return;
    }
    this.sending.set(true);
    this.incidentsService.addMessage(this.incidentId, body).subscribe({
      next: (message) => {
        this.sending.set(false);
        this.reply.set('');
        this.messages.update((list) => [...(list ?? []), message]);
      },
      error: (msg: string) => {
        this.sending.set(false);
        this.errorMessage.set(msg);
      },
    });
  }

  protected setStatus(status: IncidentStatus): void {
    if (this.updatingStatus()) {
      return;
    }
    this.updatingStatus.set(true);
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
    return { OPEN: 'Abierta', IN_REVIEW: 'En revisión', RESOLVED: 'Resuelta', ESCALATED: 'Escalada a Vakeva' }[status];
  }

  protected statusClass(status: IncidentStatus): string {
    return {
      OPEN: 'bg-amber-100 text-amber-800',
      IN_REVIEW: 'bg-sky-100 text-sky-800',
      RESOLVED: 'bg-emerald-100 text-emerald-800',
      ESCALATED: 'bg-red-100 text-red-700',
    }[status];
  }

  protected formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }
}
