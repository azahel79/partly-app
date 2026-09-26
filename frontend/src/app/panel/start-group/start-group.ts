import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GroupsService } from '../../shared/groups.service';
import { GroupStartPreview } from '../../shared/groups.models';
import { ConfirmService } from '../../shared/confirm.service';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';

@Component({
  imports: [RouterLink, PlatformLogo],
  selector: 'app-start-group',
  styleUrl: './start-group.css',
  templateUrl: './start-group.html',
})
export class StartGroup implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly groupsService = inject(GroupsService);
  private readonly confirmService = inject(ConfirmService);


  protected readonly preview = signal<GroupStartPreview | null | undefined>(undefined);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly starting = signal(false);

  /** Qué tanto del mínimo para iniciar lleva, para la barra de progreso. */
  protected readonly progressPct = computed(() => {
    const p = this.preview();
    if (!p || p.availableSlots === 0) {
      return 0;
    }
    return Math.min(100, Math.round((p.reservedSlots / p.availableSlots) * 100));
  });

  protected readonly thresholdPct = computed(() => {
    const p = this.preview();
    return p && p.availableSlots > 0 ? Math.round((p.requiredSlots / p.availableSlots) * 100) : 75;
  });

  private get groupId(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    this.groupsService.getStartPreview(this.groupId).subscribe({
      next: (preview) => this.preview.set(preview),
      error: (message: string) => {
        this.preview.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  protected money(value: number | null): string {
    return value === null ? '—' : `$${value.toFixed(2)}`;
  }

  protected async start(): Promise<void> {
    const p = this.preview();
    if (!p || this.starting()) {
      return;
    }
    const ok = await this.confirmService.ask({
      title: '¿Iniciar el grupo ahora?',
      text: `Se les cobrará a los ${p.reservedSlots} cupos reservados y tendrán 48 horas para pagar. La renovación quedará el ${this.formatDate(p.renewalDateIfStartedNow)}.`,
      confirmText: 'Sí, iniciar',
      cancelText: 'Esperar',
    });
    if (!ok) {
      return;
    }
    this.starting.set(true);
    this.errorMessage.set(null);
    this.groupsService.startGroup(this.groupId).subscribe({
      next: () => this.router.navigate(['/panel/grupos', this.groupId, 'gestion']),
      error: (message: string) => {
        this.starting.set(false);
        this.errorMessage.set(message);
      },
    });
  }
}
