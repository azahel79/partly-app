import { afterNextRender, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GroupsService } from '../../shared/groups.service';
import { CategoriesService } from '../../shared/categories.service';
import { Group } from '../../shared/groups.models';
import { Category } from '../../shared/categories.models';
import { AuthService } from '../../shared/auth.service';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';

const PAGE_SIZE = 6;
type SortOption = 'recent' | 'price-asc' | 'price-desc';

const CATEGORY_ICONS: Record<string, string> = {
  entretenimiento: 'stadia_controller',
  'productividad y oficina': 'laptop_mac',
  productividad: 'laptop_mac',
  música: 'music_note',
  educación: 'school',
};

export const QUICK_SEARCH_PLATFORMS = ['Netflix', 'Disney+', 'HBO Max', 'Spotify', 'YouTube', 'Microsoft 365'];

@Component({
  imports: [RouterLink, PlatformLogo],
  selector: 'app-explore-groups',
  styleUrl: './explore-groups.css',
  templateUrl: './explore-groups.html',
})
export class ExploreGroups implements OnInit {
  private readonly groupsService = inject(GroupsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private cancelSecondaryLoad: (() => void) | undefined;

  protected readonly groups = signal<Group[] | null>(null);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal<string | null>(null);
  protected readonly searchTerm = signal('');
  protected readonly sortBy = signal<SortOption>('recent');
  /** all = todos con lugar · forming = juntando cupos · running = ya iniciados (con días) y con lugar. */
  protected readonly stage = signal<'all' | 'forming' | 'running' | 'freeing'>('all');
  protected readonly stages: Array<{ value: 'all' | 'forming' | 'running' | 'freeing'; label: string; icon: string; hint: string }> = [
    { value: 'all', label: 'Todos', icon: 'apps', hint: 'Todos los grupos con lugar' },
    { value: 'forming', label: 'Juntando cupos', icon: 'hourglass_top', hint: 'Aún no inician: reservas tu lugar y no pagas hasta que empiece' },
    { value: 'running', label: 'Activos con lugares', icon: 'bolt', hint: 'Ya iniciaron y tienen lugares: entras pagando solo lo que resta del ciclo' },
    { value: 'freeing', label: 'Lugares por liberarse', icon: 'event_upcoming', hint: 'Alguien no renovará: apartas su lugar sin pagar y se te cobra cuando se libere' },
  ];

  protected readonly quickPlatforms = QUICK_SEARCH_PLATFORMS;

  protected readonly pageNumbers = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));

  private readonly memberDotColors = ['bg-violet-400', 'bg-amber-400', 'bg-teal-400'];

  constructor() {
    afterNextRender(() => {
      const loadCategories = () => {
        this.categoriesService.findAll().subscribe({
          next: (cats) => this.categories.set(cats),
          error: () => undefined,
        });
      };

      if ('requestIdleCallback' in window) {
        const idleId = window.requestIdleCallback(loadCategories, { timeout: 600 });
        this.cancelSecondaryLoad = () => window.cancelIdleCallback(idleId);
      } else {
        const timerId = globalThis.setTimeout(loadCategories, 120);
        this.cancelSecondaryLoad = () => globalThis.clearTimeout(timerId);
      }
    });
    this.destroyRef.onDestroy(() => this.cancelSecondaryLoad?.());
  }

  protected categoryIcon(name: string): string {
    return CATEGORY_ICONS[name.trim().toLowerCase()] ?? 'category';
  }

  /** Círculos anónimos (sin foto ni nombre inventado) que representan cupos ya ocupados, hasta 3. */
  protected memberDots(occupiedSlots: number): string[] {
    return this.memberDotColors.slice(0, Math.min(occupiedSlots, 3));
  }

  protected readonly visibleGroups = computed(() => {
    const groups = this.groups();
    if (!groups) {
      return null;
    }
    const term = this.searchTerm().trim().toLowerCase();
    const buyerGroups = groups.filter((group) => group.owner.id !== this.authService.currentUser()?.id);
    const filtered = term
      ? buyerGroups.filter(
          (g) => g.plan.platform.name.toLowerCase().includes(term) || g.plan.tierName.toLowerCase().includes(term),
        )
      : buyerGroups;

    const sorted = [...filtered];
    if (this.sortBy() === 'price-asc') {
      sorted.sort((a, b) => Number(a.pricePerSlot) - Number(b.pricePerSlot));
    } else if (this.sortBy() === 'price-desc') {
      sorted.sort((a, b) => Number(b.pricePerSlot) - Number(a.pricePerSlot));
    }
    return sorted;
  });

  ngOnInit(): void {
    this.loadGroups();
  }

  private loadGroups(): void {
    this.groups.set(null);
    const stage = this.stage();
    this.groupsService
      .findAvailable(this.page(), PAGE_SIZE, this.selectedCategoryId() ?? undefined, undefined, { withSpots: true, stage: stage === 'all' ? undefined : stage })
      .subscribe({
      next: (result) => {
        this.groups.set(result.data);
        this.total.set(result.total);
        this.totalPages.set(result.totalPages);
      },
      error: (message: string) => this.errorMessage.set(message),
    });
  }

  protected setStage(value: 'all' | 'forming' | 'running' | 'freeing'): void {
    if (this.stage() === value) return;
    this.stage.set(value);
    this.page.set(1);
    this.loadGroups();
  }

  protected calendarDateLabel(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  }

  /** Días que lleva el servicio corriendo (para mostrar "Activo desde hace N días"). */
  protected daysRunning(startedAt: string | null): number {
    return startedAt ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 86_400_000)) : 0;
  }

  protected selectCategory(categoryId: string | null): void {
    this.selectedCategoryId.set(categoryId);
    this.page.set(1);
    this.loadGroups();
  }

  protected goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) {
      return;
    }
    this.page.set(page);
    this.loadGroups();
  }

  protected setSort(option: SortOption): void {
    this.sortBy.set(option);
  }
}
