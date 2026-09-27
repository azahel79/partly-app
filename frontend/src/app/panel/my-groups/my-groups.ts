import { afterNextRender, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GroupsService } from '../../shared/groups.service';
import { Group } from '../../shared/groups.models';
import { ConfirmService } from '../../shared/confirm.service';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';
import { MoneyPipe } from '../../shared/money';
import { seatSegments } from '../../shared/seat-bar.util';
import { ownerGroupStatus } from '../../shared/status-tag.util';

@Component({
  imports: [RouterLink, PlatformLogo, MoneyPipe],
  selector: 'app-my-groups',
  styleUrl: './my-groups.css',
  templateUrl: './my-groups.html',
})
export class MyGroups implements OnInit {
  protected readonly seats = seatSegments;
  protected readonly groupStatus = ownerGroupStatus;

  private readonly confirmService = inject(ConfirmService);
  private readonly groupsService = inject(GroupsService);
  private readonly destroyRef = inject(DestroyRef);
  private cancelSecondaryLoad: (() => void) | undefined;

  protected readonly ownedGroups = signal<Group[] | null>(null);
  protected readonly joinedGroups = signal<Group[] | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly togglingId = signal<string | null>(null);
  protected readonly leavingId = signal<string | null>(null);
  protected readonly openMenuId = signal<string | null>(null);


  constructor() {
    afterNextRender(() => {
      const loadJoined = () => this.loadJoined();
      if ('requestIdleCallback' in window) {
        const idleId = window.requestIdleCallback(loadJoined, { timeout: 600 });
        this.cancelSecondaryLoad = () => window.cancelIdleCallback(idleId);
      } else {
        const timerId = globalThis.setTimeout(loadJoined, 120);
        this.cancelSecondaryLoad = () => globalThis.clearTimeout(timerId);
      }
    });
    this.destroyRef.onDestroy(() => this.cancelSecondaryLoad?.());
  }

  ngOnInit(): void {
    this.loadOwned();
  }

  private loadOwned(): void {
    this.groupsService.findMine().subscribe({
      next: (groups) => this.ownedGroups.set(groups),
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  private loadJoined(): void {
    this.groupsService.findJoined().subscribe({
      next: (groups) => this.joinedGroups.set(groups),
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  protected toggleMenu(groupId: string): void {
    this.openMenuId.update((current) => (current === groupId ? null : groupId));
  }

  protected closeMenu(): void {
    this.openMenuId.set(null);
  }

  protected toggleStatus(group: Group): void {
    if (this.togglingId() || group.status === 'CANCELLED') {
      return;
    }
    this.closeMenu();
    const nextStatus = group.status === 'PAUSED' ? 'SEARCHING_MEMBERS' : 'PAUSED';
    this.togglingId.set(group.id);
    this.groupsService.setStatus(group.id, nextStatus).subscribe({
      next: (updated) => {
        this.togglingId.set(null);
        this.ownedGroups.update((groups) => (groups ?? []).map((g) => (g.id === updated.id ? updated : g)));
      },
      error: (message: string) => {
        this.togglingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  protected async cancelGroup(group: Group): Promise<void> {
    if (this.togglingId() || group.status === 'CANCELLED') {
      return;
    }
    this.closeMenu();
    const ok = await this.confirmService.ask({
      title: `¿Cancelar el grupo de ${group.plan.platform.name}?`,
      text: 'Ya no aparecerá en el marketplace.',
      confirmText: 'Sí, cancelar grupo',
      cancelText: 'Volver',
      danger: true,
    });
    if (!ok) {
      return;
    }
    this.togglingId.set(group.id);
    this.groupsService.setStatus(group.id, 'CANCELLED').subscribe({
      next: (updated) => {
        this.togglingId.set(null);
        this.ownedGroups.update((groups) => (groups ?? []).map((g) => (g.id === updated.id ? updated : g)));
      },
      error: (message: string) => {
        this.togglingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  protected async leaveGroup(group: Group): Promise<void> {
    if (this.leavingId()) {
      return;
    }
    this.closeMenu();
    const ok = await this.confirmService.ask({
      title: `¿Salir del grupo de ${group.plan.platform.name}?`,
      text: 'Perderás tu cupo y el acceso a la cuenta compartida.',
      confirmText: 'Sí, salir',
      danger: true,
    });
    if (!ok) {
      return;
    }
    this.leavingId.set(group.id);
    this.groupsService.leave(group.id).subscribe({
      next: () => {
        this.leavingId.set(null);
        this.joinedGroups.update((groups) => (groups ?? []).filter((g) => g.id !== group.id));
      },
      error: (message: string) => {
        this.leavingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }
}
