import { Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { CommissionsService } from '../../shared/commissions.service';
import { CommissionNotice } from '../commission-notice/commission-notice';
import { AuthService } from '../../shared/auth.service';
import { NotificationsService } from '../../shared/notifications.service';
import { Notification } from '../../shared/notifications.models';
import { notificationIcon, notificationTitle, notificationTone } from '../../shared/notification-view.util';
import { ThemeService } from '../../shared/theme.service';
import { ThemeToggle } from '../../shared/theme-toggle/theme-toggle';

const POLL_INTERVAL_MS = 10_000;

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet, CommissionNotice, ThemeToggle],
  selector: 'app-panel-layout',
  styleUrls: ['./panel-layout.css', './panel-layout.profile.css'],
  templateUrl: './panel-layout.html',
})
export class PanelLayout implements OnInit, OnDestroy {
  protected readonly authService = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notificationsService = inject(NotificationsService);
  private readonly router = inject(Router);
  private readonly commissionsService = inject(CommissionsService);

  /** Menú del encabezado (escritorio). */
  protected readonly navItems = [
    { route: '/panel', label: 'Inicio', exact: true },
    { route: '/panel/explorar', label: 'Explorar', exact: false },
    { route: '/panel/grupos', label: 'Mis grupos', exact: false },
    { route: '/panel/mayoreo', label: 'Mayoreo', exact: false },
    { route: '/panel/soporte', label: 'Soporte', exact: false },
  ];

  /** Barra de pestañas de abajo (celular y tableta); Soporte queda en el menú de la cuenta. */
  protected readonly tabItems = [
    { route: '/panel', label: 'Inicio', icon: 'home', exact: true },
    { route: '/panel/explorar', label: 'Explorar', icon: 'explore', exact: false },
    { route: '/panel/grupos', label: 'Mis grupos', icon: 'group', exact: false },
    { route: '/panel/mayoreo', label: 'Mayoreo', icon: 'storefront', exact: false },
    { route: '/panel/perfil', label: 'Perfil', icon: 'person', exact: false },
  ];

  protected readonly notifications = signal<Notification[] | null>(null);
  protected readonly unreadCount = signal(0);
  protected readonly notifPanelOpen = signal(false);
  protected readonly profileMenuOpen = signal(false);
  protected readonly markingAllRead = signal(false);
  protected readonly notificationFilter = signal<'all' | 'groups' | 'system' | 'promotions'>('all');

  protected readonly notificationCounts = computed(() => {
    const list = this.notifications() ?? [];
    return {
      all: list.length,
      groups: list.filter((notification) => this.notificationCategory(notification) === 'groups').length,
      system: list.filter((notification) => this.notificationCategory(notification) === 'system').length,
      promotions: list.filter((notification) => this.notificationCategory(notification) === 'promotions').length,
    };
  });

  protected readonly filteredNotifications = computed(() => {
    const list = this.notifications() ?? [];
    const filter = this.notificationFilter();
    return filter === 'all' ? list : list.filter((notification) => this.notificationCategory(notification) === filter);
  });

  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private readonly refreshOnFocus = () => this.refreshUnreadCount();
  private readonly refreshOnVisibility = () => {
    if (document.visibilityState === 'visible') {
      this.refreshUnreadCount();
    }
  };

  ngOnInit(): void {
    this.theme.attach();
    // El aviso de comisión se actualiza al entrar a cada pantalla del panel. La suscripción se cierra
    // con el layout: si no, cada vez que se vuelve a entrar al panel (otra cuenta, otra sesión) se
    // acumula una más y cada navegación dispara N peticiones a /commissions/status.
    this.commissionsService.refreshStatus();
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.commissionsService.refreshStatus());
    this.refreshUnreadCount();
    this.pollHandle = setInterval(() => this.refreshUnreadCount(), POLL_INTERVAL_MS);
    window.addEventListener('focus', this.refreshOnFocus);
    document.addEventListener('visibilitychange', this.refreshOnVisibility);
  }

  ngOnDestroy(): void {
    this.theme.detach();
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
    }
    window.removeEventListener('focus', this.refreshOnFocus);
    document.removeEventListener('visibilitychange', this.refreshOnVisibility);
  }

  private refreshUnreadCount(): void {
    this.notificationsService.findMine(1, 1).subscribe({
      next: (res) => this.unreadCount.set(res.unreadCount),
      error: () => undefined,
    });
  }

  protected toggleNotifPanel(): void {
    const next = !this.notifPanelOpen();
    this.profileMenuOpen.set(false);
    this.notifPanelOpen.set(next);
    if (next) {
      this.loadNotifications();
    }
  }

  protected toggleProfileMenu(): void {
    this.notifPanelOpen.set(false);
    this.profileMenuOpen.update(open => !open);
  }

  protected closeProfileMenu(): void {
    this.profileMenuOpen.set(false);
  }

  protected closeNotifPanel(): void {
    this.notifPanelOpen.set(false);
  }

  private loadNotifications(): void {
    this.notificationsService.findMine(1, 50).subscribe({
      next: (res) => {
        this.notifications.set(res.data);
        this.unreadCount.set(res.unreadCount);
      },
      error: () => this.notifications.set([]),
    });
  }

  protected notificationIcon(notification: Notification): string {
    return notificationIcon(notification, 'panel');
  }

  protected setNotificationFilter(filter: 'all' | 'groups' | 'system' | 'promotions'): void {
    this.notificationFilter.set(filter);
  }

  protected notificationTitle(notification: Notification): string {
    return notificationTitle(notification, 'panel');
  }

  protected notificationTone(notification: Notification): string {
    return notificationTone(notification);
  }

  private notificationCategory(notification: Notification): 'groups' | 'system' | 'promotions' {
    if (/promoci|descuento|oferta/i.test(notification.payload)) return 'promotions';
    return notification.groupId ? 'groups' : 'system';
  }

  protected openNotification(notification: Notification): void {
    if (!notification.readAt) {
      this.notificationsService.markRead(notification.id).subscribe({
        next: (updated) => {
          this.notifications.update((list) => (list ?? []).map((n) => (n.id === updated.id ? updated : n)));
          this.unreadCount.update((count) => Math.max(0, count - 1));
        },
        error: () => undefined,
      });
    }
    this.closeNotifPanel();
    if (notification.type.startsWith('COMMISSION_')) {
      this.router.navigateByUrl('/panel/comisiones');
    } else if (notification.type.startsWith('PROVIDER_ORDER_') || notification.type.startsWith('WHOLESALE_ACCESS_')) {
      this.router.navigateByUrl('/panel/mayoreo');
    } else if (notification.groupId && (notification.type === 'GROUP_READY_TO_START' || notification.type === 'GROUP_FULL' || notification.type === 'GROUP_START_REMINDER')) {
      this.router.navigate(['/panel/grupos', notification.groupId, 'iniciar']);
    } else if (notification.groupId) {
      this.router.navigate(['/panel/grupos', notification.groupId]);
    }
  }

  protected markAllRead(): void {
    if (this.markingAllRead() || this.unreadCount() === 0) {
      return;
    }
    this.markingAllRead.set(true);
    this.notificationsService.markAllRead().subscribe({
      next: () => {
        this.markingAllRead.set(false);
        this.unreadCount.set(0);
        this.notifications.update((list) => (list ?? []).map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
      },
      error: () => this.markingAllRead.set(false),
    });
  }

  protected relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));
    if (diffMin < 1) {
      return 'Ahora';
    }
    if (diffMin < 60) {
      return `Hace ${diffMin} min`;
    }
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
      return `Hace ${diffHours} h`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `Hace ${diffDays} d`;
  }

  protected logout(): void {
    this.closeProfileMenu();
    this.authService.logout();
    this.router.navigateByUrl('/');
  }

  protected initials(): string {
    const name = this.authService.currentUser()?.name ?? '';
    return name.trim().charAt(0).toUpperCase() || '?';
  }
}
