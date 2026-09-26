import { Component, OnInit, inject, signal } from '@angular/core';
import { ProviderProfilesService } from '../../shared/provider-profiles.service';
import { ProviderProfile, ProviderProfileStatus } from '../../shared/provider-profiles.models';

@Component({
  imports: [],
  selector: 'app-provider-requests',
  styleUrl: './provider-requests.css',
  templateUrl: './provider-requests.html',
})
export class ProviderRequests implements OnInit {
  private readonly providerProfilesService = inject(ProviderProfilesService);

  protected readonly profiles = signal<ProviderProfile[] | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly reviewingId = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.providerProfilesService.findAll().subscribe({
      next: (page) => this.profiles.set(page.data),
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  protected review(id: string, status: ProviderProfileStatus): void {
    if (this.reviewingId()) {
      return;
    }
    this.reviewingId.set(id);
    this.providerProfilesService.review(id, status).subscribe({
      next: (updated) => {
        this.reviewingId.set(null);
        // El endpoint de revisión no vuelve a incluir al solicitante (user), así que
        // solo pisamos el status y conservamos el resto de la fila ya cargada.
        this.profiles.update((profiles) => (profiles ?? []).map((p) => (p.id === updated.id ? { ...p, status: updated.status } : p)));
      },
      error: (message: string) => {
        this.reviewingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }
}
