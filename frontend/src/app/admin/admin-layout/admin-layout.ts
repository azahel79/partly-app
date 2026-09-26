import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/auth.service';
import { NotificationsService } from '../../shared/notifications.service';
import { Notification } from '../../shared/notifications.models';
import { ThemeService } from '../../shared/theme.service';
import { ThemeToggle } from '../../shared/theme-toggle/theme-toggle';

const ADMIN_SECTIONS = [
  { label: 'Resumen', keywords: 'inicio dashboard métricas', route: '/admin', icon: 'space_dashboard' },
  { label: 'Solicitudes de proveedor', keywords: 'proveedores solicitudes', route: '/admin/proveedores', icon: 'badge' },
  { label: 'Mi tienda', keywords: 'proveedor tienda cuentas mayoreo vender publicar', route: '/admin/mi-tienda', icon: 'storefront' },
  { label: 'Grupos', keywords: 'grupos revisión aprobar rechazar', route: '/admin/grupos', icon: 'groups' },
  { label: 'Pagos y comprobantes', keywords: 'pagos comprobantes transferencias supervision', route: '/admin/pagos', icon: 'receipt_long' },
  { label: 'Acceso a mayoreo', keywords: 'acceso mayoreo reputación autorizar vendedores tope', route: '/admin/mayoreo-acceso', icon: 'verified_user' },
  { label: 'Comisiones', keywords: 'comisiones cobros vendedores cuenta bancaria transferencias', route: '/admin/comisiones', icon: 'request_quote' },
  { label: 'Correos', keywords: 'correos emails bandeja recordatorios envío proveedor dominio', route: '/admin/correos', icon: 'mark_email_read' },
  { label: 'Incidencias', keywords: 'incidencias soporte problemas', route: '/admin/incidencias', icon: 'support_agent' },
  { label: 'Usuarios', keywords: 'usuarios cuentas roles', route: '/admin/usuarios', icon: 'manage_accounts' },
];

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ThemeToggle],
  selector: 'app-admin-layout',
  styleUrl: './admin-layout.css',
  templateUrl: './admin-layout.html',
})
export class AdminLayout implements OnInit, OnDestroy {
  protected readonly authService = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly notificationsService = inject(NotificationsService);

  protected readonly notifications = signal<Notification[] | null>(null);
  protected readonly unreadCount = signal(0);
  protected readonly notifPanelOpen = signal(false);
  protected readonly markingAllRead = signal(false);
  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private readonly refreshOnFocus = () => this.refreshUnreadCount();

  ngOnInit(): void {
    this.theme.attach();
    this.refreshUnreadCount();
    this.pollHandle = setInterval(() => this.refreshUnreadCount(), 10_000);
    window.addEventListener('focus', this.refreshOnFocus);
  }

  ngOnDestroy(): void {
    this.theme.detach();
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
    }
    window.removeEventListener('focus', this.refreshOnFocus);
  }

  private refreshUnreadCount(): void {
    this.notificationsService.findMine(1, 1).subscribe({
      next: (res) => this.unreadCount.set(res.unreadCount),
      error: () => undefined,
    });
  }

  protected toggleNotifPanel(): void {
    const next = !this.notifPanelOpen();
    this.notifPanelOpen.set(next);
    if (next) {
      this.notificationsService.findMine(1, 30).subscribe({
        next: (res) => {
          this.notifications.set(res.data);
          this.unreadCount.set(res.unreadCount);
        },
        error: () => this.notifications.set([]),
      });
    }
  }

  /** El backdrop-filter de la barra superior encierra a los `fixed` hijos, así que el cierre por clic fuera se hace a nivel documento. */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: Event): void {
    if (this.notifPanelOpen() && !(event.target as HTMLElement).closest('.notif-wrap')) {
      this.closeNotifPanel();
    }
  }

  protected closeNotifPanel(): void {
    this.notifPanelOpen.set(false);
  }

  protected notificationIcon(n: Notification): string {
    if (n.type === 'PROVIDER_ORDER_PLACED') return 'shopping_cart';
    if (n.type.startsWith('PROVIDER_')) return 'storefront';
    if (n.type.startsWith('INCIDENT_')) return 'support_agent';
    if (n.type.startsWith('PAYMENT_')) return 'receipt_long';
    if (n.type.startsWith('WHOLESALE_ACCESS_')) return 'verified_user';
    if (n.type.startsWith('COMMISSION_')) return 'request_quote';
    if (n.type === 'PAYOUT_PAID') return 'payments';
    return n.groupId ? 'groups' : 'info';
  }

  protected notificationTitle(n: Notification): string {
    if (n.type === 'PROVIDER_ORDER_PLACED') return 'Nueva solicitud de compra';
    if (n.type.startsWith('PROVIDER_')) return 'Actualización de proveedor';
    if (n.type.startsWith('INCIDENT_')) return 'Incidencia';
    if (n.type.startsWith('WHOLESALE_ACCESS_')) return 'Acceso a mayoreo';
    if (n.type.startsWith('COMMISSION_')) return 'Comisiones';
    if (n.type.startsWith('PAYMENT_')) return 'Pagos';
    return n.groupId ? 'Grupo' : 'Aviso de Partly';
  }

  protected openNotification(n: Notification): void {
    if (!n.readAt) {
      this.notificationsService.markRead(n.id).subscribe({
        next: (updated) => {
          this.notifications.update((list) => (list ?? []).map((x) => (x.id === updated.id ? updated : x)));
          this.unreadCount.update((c) => Math.max(0, c - 1));
        },
        error: () => undefined,
      });
    }
    this.closeNotifPanel();
    if (n.type.startsWith('WHOLESALE_ACCESS_')) {
      this.router.navigateByUrl('/admin/mayoreo-acceso');
    } else if (n.type.startsWith('PROVIDER_')) {
      this.router.navigateByUrl('/admin/mi-tienda');
    } else if (n.type.startsWith('INCIDENT_')) {
      this.router.navigateByUrl('/admin/incidencias');
    } else if (n.type.startsWith('COMMISSION_')) {
      this.router.navigateByUrl('/admin/comisiones');
    } else if (n.groupId) {
      this.router.navigate(['/admin/grupos', n.groupId]);
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
        this.notifications.update((list) => (list ?? []).map((x) => (x.readAt ? x : { ...x, readAt: new Date().toISOString() })));
      },
      error: () => this.markingAllRead.set(false),
    });
  }

  protected relativeTime(iso: string): string {
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'Ahora';
    if (min < 60) return `Hace ${min} min`;
    const h = Math.floor(min / 60);
    return h < 24 ? `Hace ${h} h` : `Hace ${Math.floor(h / 24)} d`;
  }
  protected readonly sidebarOpen = signal(false);
  protected readonly search = signal('');
  protected readonly searchFocused = signal(false);
  protected readonly sections = ADMIN_SECTIONS;
  protected readonly searchResults = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('es');
    return query ? ADMIN_SECTIONS.filter((item) => `${item.label} ${item.keywords}`.toLocaleLowerCase('es').includes(query)) : [];
  });

  protected toggleSidebar(): void { this.sidebarOpen.update((open) => !open); }
  protected closeSidebar(): void { this.sidebarOpen.set(false); }
  protected updateSearch(event: Event): void { this.search.set((event.target as HTMLInputElement).value); }
  protected goTo(route: string): void { this.search.set(''); this.searchFocused.set(false); this.router.navigateByUrl(route); }
  protected initials(name?: string): string { return (name || 'A').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
  protected logout(): void { this.authService.logout(); this.router.navigateByUrl('/'); }
}
