import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GroupsService } from '../../shared/groups.service';
import { Group, GroupApprovalStatus } from '../../shared/groups.models';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';

type SortOption = 'recent' | 'oldest' | 'price_desc' | 'price_asc' | 'name_asc';

const PAGE_SIZE = 10;

@Component({
  imports: [DatePipe, PlatformLogo],
  selector: 'app-group-requests',
  styleUrl: './group-requests.css',
  templateUrl: './group-requests.html',
})
export class GroupRequests implements OnInit {
  private readonly groupsService = inject(GroupsService);
  private readonly router = inject(Router);

  protected readonly groups = signal<Group[] | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly reviewingId = signal<string | null>(null);

  protected readonly statusFilter = signal<GroupApprovalStatus | ''>('PENDING');
  protected readonly platformFilter = signal('');
  protected readonly search = signal('');
  protected readonly sortBy = signal<SortOption>('recent');
  protected readonly page = signal(1);

  protected readonly rejectingId = signal<string | null>(null);
  protected readonly rejectReason = signal('');

  protected readonly brokenLogos = signal<ReadonlySet<string>>(new Set());

  protected markBroken(id: string): void {
    this.brokenLogos.update((s) => new Set(s).add(id));
  }

  protected readonly filterOptions: Array<{ value: GroupApprovalStatus | ''; label: string }> = [
    { value: 'PENDING', label: 'Pendientes' },
    { value: 'APPROVED', label: 'Aprobados' },
    { value: 'REJECTED', label: 'Rechazados' },
    { value: '', label: 'Todos' },
  ];

  protected readonly sortOptions: Array<{ value: SortOption; label: string }> = [
    { value: 'recent', label: 'Más recientes' },
    { value: 'oldest', label: 'Más antiguos' },
    { value: 'price_desc', label: 'Precio: mayor a menor' },
    { value: 'price_asc', label: 'Precio: menor a mayor' },
    { value: 'name_asc', label: 'Plataforma A-Z' },
  ];

  /** Conteos reales para las tarjetas — sobre el total cargado, sin importar el filtro activo. */
  protected readonly counts = computed(() => {
    const all = this.groups() ?? [];
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return {
      pending: all.filter((g) => g.approvalStatus === 'PENDING').length,
      approved: all.filter((g) => g.approvalStatus === 'APPROVED').length,
      rejected: all.filter((g) => g.approvalStatus === 'REJECTED').length,
      rejectedLast30d: all.filter(
        (g) => g.approvalStatus === 'REJECTED' && g.reviewedAt !== null && new Date(g.reviewedAt).getTime() >= thirtyDaysAgo,
      ).length,
      total: all.length,
    };
  });

  protected readonly platformOptions = computed(() => {
    const all = this.groups() ?? [];
    return Array.from(new Set(all.map((g) => g.plan.platform.name))).sort((a, b) => a.localeCompare(b, 'es'));
  });

  private readonly filteredSorted = computed(() => {
    let list = this.groups() ?? [];
    const status = this.statusFilter();
    if (status) {
      list = list.filter((g) => g.approvalStatus === status);
    }
    const platform = this.platformFilter();
    if (platform) {
      list = list.filter((g) => g.plan.platform.name === platform);
    }
    const query = this.search().trim().toLocaleLowerCase('es');
    if (query) {
      list = list.filter(
        (g) => g.plan.platform.name.toLocaleLowerCase('es').includes(query) || g.owner.name.toLocaleLowerCase('es').includes(query),
      );
    }
    const sorted = [...list];
    switch (this.sortBy()) {
      case 'recent':
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'oldest':
        sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case 'price_desc':
        sorted.sort((a, b) => Number(b.pricePerSlot) - Number(a.pricePerSlot));
        break;
      case 'price_asc':
        sorted.sort((a, b) => Number(a.pricePerSlot) - Number(b.pricePerSlot));
        break;
      case 'name_asc':
        sorted.sort((a, b) => a.plan.platform.name.localeCompare(b.plan.platform.name, 'es'));
        break;
    }
    return sorted;
  });

  protected readonly totalFiltered = computed(() => this.filteredSorted().length);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalFiltered() / PAGE_SIZE)));
  protected readonly pageRows = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.filteredSorted().slice(start, start + PAGE_SIZE);
  });
  protected readonly rangeStart = computed(() => (this.totalFiltered() === 0 ? 0 : (this.page() - 1) * PAGE_SIZE + 1));
  protected readonly rangeEnd = computed(() => Math.min(this.page() * PAGE_SIZE, this.totalFiltered()));
  protected readonly pageNumbers = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.groups.set(null);
    this.groupsService.findAllForAdmin(undefined, 1, 100).subscribe({
      next: (page) => this.groups.set(page.data),
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  protected setFilter(status: GroupApprovalStatus | ''): void {
    this.statusFilter.set(status);
    this.page.set(1);
    this.cancelReject();
  }

  protected setPlatformFilter(value: string): void {
    this.platformFilter.set(value);
    this.page.set(1);
  }

  protected onSearchChange(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  protected setSort(value: SortOption): void {
    this.sortBy.set(value);
  }

  protected clearFilters(): void {
    this.statusFilter.set('PENDING');
    this.platformFilter.set('');
    this.search.set('');
    this.sortBy.set('recent');
    this.page.set(1);
  }

  protected goToPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.totalPages()));
  }

  protected approve(id: string): void {
    if (this.reviewingId()) {
      return;
    }
    this.reviewingId.set(id);
    this.groupsService.reviewApproval(id, 'APPROVED').subscribe({
      next: () => {
        this.reviewingId.set(null);
        this.load();
      },
      error: (message: string) => {
        this.reviewingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  protected startReject(id: string): void {
    this.rejectingId.set(id);
    this.rejectReason.set('');
  }

  protected cancelReject(): void {
    this.rejectingId.set(null);
    this.rejectReason.set('');
  }

  protected confirmReject(id: string): void {
    const reason = this.rejectReason().trim();
    if (!reason || this.reviewingId()) {
      return;
    }
    this.reviewingId.set(id);
    this.groupsService.reviewApproval(id, 'REJECTED', reason).subscribe({
      next: () => {
        this.reviewingId.set(null);
        this.cancelReject();
        this.load();
      },
      error: (message: string) => {
        this.reviewingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  protected goToDetail(id: string): void {
    this.router.navigate(['/admin/grupos', id]);
  }

  protected relativeTime(value: string): string {
    const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return 'Ahora';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Hace ${days} d`;
  }
}
