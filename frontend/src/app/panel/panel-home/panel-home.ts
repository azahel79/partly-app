import { periodNoun } from '../../shared/billing-period.util';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../shared/auth.service';
import { GroupsService } from '../../shared/groups.service';
import { CommissionsService } from '../../shared/commissions.service';
import { Group } from '../../shared/groups.models';
import { Membership } from '../../shared/memberships.models';
import { EarningsSummary } from '../../shared/commissions.models';
import { planFeatures } from '../../shared/plan-features.util';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';
import { MoneyPipe } from '../../shared/money';
import { ownerGroupStatus } from '../../shared/status-tag.util';

const PREVIEW_LIMIT = 3;
const OCCUPYING_STATUSES = new Set(['ACTIVE', 'SUSPENDED']);

@Component({
  imports: [RouterLink, PlatformLogo, MoneyPipe],
  selector: 'app-panel-home',
  styleUrl: './panel-home.css',
  templateUrl: './panel-home.html',
})
export class PanelHome implements OnInit {
  protected readonly periodNoun = periodNoun;
  protected readonly authService = inject(AuthService);
  private readonly groupsService = inject(GroupsService);
  private readonly commissionsService = inject(CommissionsService);

  protected readonly myGroups = signal<Group[] | null>(null);
  protected readonly joinedGroups = signal<Group[] | null>(null);
  protected readonly earnings = signal<EarningsSummary | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly earningsError = signal<string | null>(null);

  protected readonly membersByGroup = signal<Record<string, Membership[]>>({});
  protected readonly openMenuId = signal<string | null>(null);
  protected readonly togglingId = signal<string | null>(null);

  protected readonly planFeatures = planFeatures;
  protected readonly groupStatus = ownerGroupStatus;

  protected readonly previewGroups = computed(() => this.myGroups()?.slice(0, PREVIEW_LIMIT) ?? []);
  protected readonly hiddenGroupsCount = computed(() => Math.max(0, (this.myGroups()?.length ?? 0) - PREVIEW_LIMIT));

  protected readonly avgOccupancyPct = computed(() => {
    const groups = this.myGroups();
    if (!groups || groups.length === 0) {
      return 0;
    }
    const totalSlots = groups.reduce((sum, g) => sum + g.availableSlots, 0);
    const totalOccupied = groups.reduce((sum, g) => sum + g.occupiedSlots, 0);
    return totalSlots === 0 ? 0 : Math.round((totalOccupied / totalSlots) * 100);
  });

  ngOnInit(): void {
    this.groupsService.findMine().subscribe({
      next: (groups) => {
        this.myGroups.set(groups);
        for (const group of groups.slice(0, PREVIEW_LIMIT)) {
          this.loadMembers(group.id);
        }
      },
      error: (message: string) => this.errorMessage.set(message),
    });
    this.commissionsService.getEarningsSummary().subscribe({
      next: (summary) => this.earnings.set(summary),
      error: (message: string) => this.earningsError.set(message),
    });
    this.groupsService.findJoined().subscribe({
      next: (groups) => this.joinedGroups.set(groups),
      error: () => this.joinedGroups.set([]),
    });
  }

  protected readonly previewJoinedGroups = computed(() => this.joinedGroups()?.slice(0, PREVIEW_LIMIT) ?? []);

  private loadMembers(groupId: string): void {
    this.groupsService.findMembers(groupId).subscribe({
      next: (members) => {
        const live = members.filter((m) => OCCUPYING_STATUSES.has(m.status));
        this.membersByGroup.update((map) => ({ ...map, [groupId]: live }));
      },
      error: () => undefined,
    });
  }

  protected activeMembers(groupId: string): Membership[] {
    return this.membersByGroup()[groupId] ?? [];
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
        this.myGroups.update((groups) => (groups ?? []).map((g) => (g.id === updated.id ? updated : g)));
      },
      error: (message: string) => {
        this.togglingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  protected renewalLabel(iso: string): string {
    const date = new Date(iso);
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
}
