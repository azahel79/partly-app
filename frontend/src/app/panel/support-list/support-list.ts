import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IncidentsService } from '../../shared/incidents.service';
import { Incident } from '../../shared/incidents.models';
import { AuthService } from '../../shared/auth.service';

@Component({
  imports: [RouterLink],
  selector: 'app-support-list',
  templateUrl: './support-list.html',
})
export class SupportList implements OnInit {
  private readonly incidentsService = inject(IncidentsService);
  private readonly authService = inject(AuthService);

  protected readonly incidents = signal<Incident[] | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected roleFor(incident: Incident): 'reportante' | 'responsable' {
    return incident.reportedBy.id === this.authService.currentUser()?.id ? 'reportante' : 'responsable';
  }

  ngOnInit(): void {
    this.incidentsService.findMine(1, 50).subscribe({
      next: (res) => this.incidents.set(res.data),
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  protected statusLabel(status: Incident['status']): string {
    return { OPEN: 'Abierta', IN_REVIEW: 'En revisión', RESOLVED: 'Resuelta', ESCALATED: 'Escalada a Vakeva' }[status];
  }

  protected statusClass(status: Incident['status']): string {
    return {
      OPEN: 'bg-amber-100 text-amber-800',
      IN_REVIEW: 'bg-sky-100 text-sky-800',
      RESOLVED: 'bg-emerald-100 text-emerald-800',
      ESCALATED: 'bg-red-100 text-red-700',
    }[status];
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
  }
}
