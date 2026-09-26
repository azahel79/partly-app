import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { IncidentsService } from '../../shared/incidents.service';
import { Incident, IncidentMessage, IncidentStatus } from '../../shared/incidents.models';

@Component({
  imports: [RouterLink, DatePipe],
  selector: 'app-incident-detail',
  styleUrl: './incident-detail.css',
  templateUrl: './incident-detail.html',
})
export class IncidentDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly incidentsService = inject(IncidentsService);

  protected readonly incident = signal<Incident | null>(null);
  protected readonly messages = signal<IncidentMessage[] | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly sending = signal(false);
  protected readonly updatingStatus = signal(false);

  protected readonly statusOptions: IncidentStatus[] = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'ESCALATED'];

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

  protected sendMessage(textarea: HTMLTextAreaElement): void {
    const body = textarea.value.trim();
    if (!body || this.sending()) {
      return;
    }
    this.sending.set(true);
    this.incidentsService.addMessage(this.incidentId, body).subscribe({
      next: (message) => {
        this.sending.set(false);
        textarea.value = '';
        this.messages.update((list) => [...(list ?? []), message]);
      },
      error: (message: string) => {
        this.sending.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected changeStatus(status: IncidentStatus): void {
    if (this.updatingStatus() || status === this.incident()?.status) {
      return;
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
}
