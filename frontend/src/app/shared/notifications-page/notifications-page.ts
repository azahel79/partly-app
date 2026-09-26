import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NotificationsService } from '../notifications.service';
import { Notification } from '../notifications.models';
import {
  NotificationArea,
  NotificationCategory,
  notificationCategory,
  notificationIcon,
  notificationTarget,
  notificationTitle,
  notificationTone,
} from '../notification-view.util';

type Filter = 'all' | 'unread' | NotificationCategory;

const PAGE_SIZE = 50;

/**
 * Pantalla completa de notificaciones (panel y admin). La campana solo muestra un resumen recortado;
 * aquí se lee el mensaje completo, a qué grupo se refiere, cuándo llegó y se puede saltar directo a la
 * pantalla que corresponde. La ruta define desde dónde se ve con `data: { area }`.
 */
@Component({
  selector: 'app-notifications-page',
  templateUrl: './notifications-page.html',
})
export class NotificationsPage implements OnInit {
  private readonly notificationsService = inject(NotificationsService);
  private readonly router = inject(Router);
  protected readonly area: NotificationArea = inject(ActivatedRoute).snapshot.data['area'] === 'admin' ? 'admin' : 'panel';

  protected readonly items = signal<Notification[] | null>(null);
  protected readonly total = signal(0);
  protected readonly unread = signal(0);
  protected readonly filter = signal<Filter>('all');
  protected readonly loadingMore = signal(false);
  protected readonly markingAll = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  private page = 1;

  protected readonly filters = computed<Array<{ value: Filter; label: string; count: number }>>(() => {
    const list = this.items() ?? [];
    const count = (category: NotificationCategory) => list.filter((n) => notificationCategory(n) === category).length;
    const all: Array<{ value: Filter; label: string; count: number }> = [
      { value: 'all', label: 'Todas', count: this.total() },
      { value: 'unread', label: 'Sin leer', count: this.unread() },
      { value: 'groups', label: 'Grupos', count: count('groups') },
      { value: 'payments', label: 'Pagos y comisiones', count: count('payments') },
      { value: 'wholesale', label: 'Mayoreo', count: count('wholesale') },
      { value: 'support', label: 'Soporte', count: count('support') },
    ];
    // Las categorías vacías no aportan: se muestran solo si tienen algo (o si es la activa).
    return all.filter((f) => f.value === 'all' || f.value === 'unread' || f.count > 0 || f.value === this.filter());
  });

  /** Notificaciones filtradas y agrupadas por día ("Hoy", "Ayer", fecha). */
  protected readonly groups = computed(() => {
    const filter = this.filter();
    const list = (this.items() ?? []).filter((n) => (filter === 'all' ? true : filter === 'unread' ? !n.readAt : notificationCategory(n) === filter));
    const buckets: Array<{ label: string; items: Notification[] }> = [];
    for (const n of list) {
      const label = this.dayLabel(n.createdAt);
      const last = buckets[buckets.length - 1];
      if (last && last.label === label) last.items.push(n);
      else buckets.push({ label, items: [n] });
    }
    return buckets;
  });

  protected readonly hasMore = computed(() => (this.items()?.length ?? 0) < this.total());

  ngOnInit(): void {
    this.load(true);
  }

  private load(first: boolean): void {
    if (first) {
      this.page = 1;
      this.items.set(null);
    }
    this.errorMessage.set(null);
    this.notificationsService.findMine(this.page, PAGE_SIZE).subscribe({
      next: (res) => {
        this.items.update((current) => (first ? res.data : [...(current ?? []), ...res.data]));
        this.total.set(res.total);
        this.unread.set(res.unreadCount);
        this.loadingMore.set(false);
      },
      error: (message: string) => {
        this.items.update((current) => current ?? []);
        this.loadingMore.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    this.page += 1;
    this.load(false);
  }

  protected setFilter(value: Filter): void {
    this.filter.set(value);
  }

  protected icon(n: Notification): string {
    return notificationIcon(n, this.area);
  }
  protected title(n: Notification): string {
    return notificationTitle(n, this.area);
  }
  protected tone(n: Notification): string {
    return notificationTone(n);
  }
  protected target(n: Notification) {
    return notificationTarget(n, this.area);
  }

  protected markRead(n: Notification): void {
    if (n.readAt) return;
    this.notificationsService.markRead(n.id).subscribe({
      next: (updated) => {
        this.items.update((list) => (list ?? []).map((x) => (x.id === updated.id ? { ...x, readAt: updated.readAt } : x)));
        this.unread.update((count) => Math.max(0, count - 1));
      },
      error: () => undefined,
    });
  }

  protected go(n: Notification, event: Event): void {
    event.stopPropagation();
    this.markRead(n);
    const target = this.target(n);
    if (target) this.router.navigate(target.commands);
  }

  protected markAllRead(): void {
    if (this.markingAll() || this.unread() === 0) return;
    this.markingAll.set(true);
    this.notificationsService.markAllRead().subscribe({
      next: () => {
        this.markingAll.set(false);
        this.unread.set(0);
        const now = new Date().toISOString();
        this.items.update((list) => (list ?? []).map((n) => (n.readAt ? n : { ...n, readAt: now })));
      },
      error: () => this.markingAll.set(false),
    });
  }

  protected timeLabel(iso: string): string {
    return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  }

  protected relative(iso: string): string {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    return `hace ${Math.floor(hours / 24)} d`;
  }

  private dayLabel(iso: string): string {
    const date = new Date(iso);
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOf(new Date()) - startOf(date)) / 86_400_000);
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }
}
