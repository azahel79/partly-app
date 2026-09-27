import { forkJoin, map, of, switchMap } from 'rxjs';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { UsersService } from '../../shared/users.service';
import { WalletService } from '../../shared/wallet.service';
import { AdminUser, Role } from '../../shared/users.models';
import { Wallet } from '../../shared/wallet.models';
import { avatarColor, initials } from '../../shared/avatar-color.util';
import { MoneyPipe } from '../../shared/money';

type SortOption = 'recent' | 'oldest' | 'name_asc';

@Component({
  imports: [MoneyPipe, MoneyPipe],
  selector: 'app-users-list',
  styleUrl: './users-list.css',
  templateUrl: './users-list.html',
})
export class UsersList implements OnInit {
  private readonly usersService = inject(UsersService);
  private readonly walletService = inject(WalletService);

  protected readonly users = signal<AdminUser[] | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly roleFilter = signal<Role | ''>('');
  protected readonly sortBy = signal<SortOption>('recent');
  protected readonly updatingId = signal<string | null>(null);
  protected readonly openMenuId = signal<string | null>(null);
  protected readonly copiedId = signal<string | null>(null);

  protected readonly walletFor = signal<AdminUser | null>(null);
  protected readonly wallet = signal<Wallet | null>(null);
  protected readonly walletError = signal<string | null>(null);
  protected readonly confirmDemote = signal<AdminUser | null>(null);

  protected readonly avatarColor = avatarColor;
  protected readonly initials = initials;

  protected readonly sortOptions: Array<{ value: SortOption; label: string }> = [
    { value: 'recent', label: 'Más recientes' },
    { value: 'oldest', label: 'Más antiguos' },
    { value: 'name_asc', label: 'Nombre A-Z' },
  ];

  /** Conteos reales para las tarjetas — sobre el total cargado, sin importar el filtro activo. */
  protected readonly counts = computed(() => {
    const all = this.users() ?? [];
    return {
      total: all.length,
      admins: all.filter((u) => u.role === 'ADMIN').length,
      regular: all.filter((u) => u.role === 'USER').length,
      google: all.filter((u) => u.authProvider === 'GOOGLE').length,
    };
  });

  protected readonly rows = computed(() => {
    let list = this.users() ?? [];
    const role = this.roleFilter();
    if (role) {
      list = list.filter((u) => u.role === role);
    }
    const query = this.search().trim().toLocaleLowerCase('es');
    if (query) {
      list = list.filter((u) => u.name.toLocaleLowerCase('es').includes(query) || u.email.toLocaleLowerCase('es').includes(query));
    }
    const sorted = [...list];
    switch (this.sortBy()) {
      case 'recent':
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'oldest':
        sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case 'name_asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        break;
    }
    return sorted;
  });

  ngOnInit(): void {
    this.load();
  }

  protected onSearchChange(value: string): void {
    this.search.set(value);
  }

  protected setRoleFilter(role: Role | ''): void {
    this.roleFilter.set(role);
  }

  protected setSort(value: SortOption): void {
    this.sortBy.set(value);
  }

  private load(): void {
    this.users.set(null);
    // El backend limita a 100 por página; el filtrado y las métricas son locales, así que se traen todas.
    this.usersService
      .findAll({ page: 1, limit: 100 })
      .pipe(
        switchMap((first) => {
          if (first.totalPages <= 1) {
            return of(first.data);
          }
          const rest = Array.from({ length: first.totalPages - 1 }, (_, i) => this.usersService.findAll({ page: i + 2, limit: 100 }));
          return forkJoin(rest).pipe(map((pages) => [...first.data, ...pages.flatMap((page) => page.data)]));
        }),
      )
      .subscribe({
        next: (all) => this.users.set(all),
        error: (message: string) => {
          this.users.set([]);
          this.errorMessage.set(message);
        },
      });
  }

  protected requestRoleChange(user: AdminUser): void {
    this.closeMenu();
    if (user.role === 'ADMIN') {
      this.confirmDemote.set(user);
      return;
    }
    this.applyRoleChange(user, 'ADMIN');
  }

  protected confirmRoleChange(): void {
    const user = this.confirmDemote();
    if (!user) {
      return;
    }
    this.confirmDemote.set(null);
    this.applyRoleChange(user, 'USER');
  }

  protected cancelRoleChange(): void {
    this.confirmDemote.set(null);
  }

  private applyRoleChange(user: AdminUser, role: Role): void {
    if (this.updatingId()) {
      return;
    }
    this.updatingId.set(user.id);
    this.errorMessage.set(null);
    this.usersService.updateRole(user.id, role).subscribe({
      next: (updated) => {
        this.updatingId.set(null);
        this.users.update((list) => (list ?? []).map((u) => (u.id === updated.id ? updated : u)));
      },
      error: (message: string) => {
        this.updatingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  protected viewWallet(user: AdminUser): void {
    this.closeMenu();
    this.walletFor.set(user);
    this.wallet.set(null);
    this.walletError.set(null);
    this.walletService.getByUserId(user.id).subscribe({
      next: (wallet) => this.wallet.set(wallet),
      error: (message: string) => this.walletError.set(message),
    });
  }

  protected closeWallet(): void {
    this.walletFor.set(null);
  }

  protected toggleMenu(id: string): void {
    this.openMenuId.update((current) => (current === id ? null : id));
  }

  protected closeMenu(): void {
    this.openMenuId.set(null);
  }

  protected copyEmail(user: AdminUser): void {
    navigator.clipboard?.writeText(user.email).then(() => {
      this.copiedId.set(user.id);
      setTimeout(() => this.copiedId.set(null), 1500);
    });
  }
}
