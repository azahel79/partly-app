import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IncidentsService } from '../../shared/incidents.service';
import { Incident, IncidentStatus } from '../../shared/incidents.models';

@Component({
  imports: [RouterLink],
  selector: 'app-incidents-queue',
  styleUrl: './incidents-queue.css',
  templateUrl: './incidents-queue.html',
})
export class IncidentsQueue implements OnInit {
  private readonly incidentsService = inject(IncidentsService);

  protected readonly incidents = signal<Incident[] | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly statusFilter = signal<IncidentStatus | ''>('');

  protected readonly filterOptions: Array<{ value: IncidentStatus | ''; label: string }> = [
    { value: '', label: 'Todas' },
    { value: 'OPEN', label: 'Abiertas' },
    { value: 'IN_REVIEW', label: 'En revisión' },
    { value: 'ESCALATED', label: 'Escaladas' },
    { value: 'RESOLVED', label: 'Resueltas' },
  ];

  ngOnInit(): void {
    this.load();
  }

  protected setFilter(status: IncidentStatus | ''): void {
    this.statusFilter.set(status);
    this.load();
  }

  private load(): void {
    this.incidents.set(null);
    this.incidentsService.findAll(this.statusFilter() || undefined, 1, 100).subscribe({
      next: (page) => this.incidents.set(page.data),
      error: (message: string) => this.errorMessage.set(message),
    });
  }
}
