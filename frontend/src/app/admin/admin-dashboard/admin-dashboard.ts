import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AreaSeries, ColorType, IChartApi, Time, createChart } from 'lightweight-charts';
import { AdminDashboardData, AdminActivityType } from '../../shared/admin-dashboard.models';
import { AdminDashboardService } from '../../shared/admin-dashboard.service';
import { ThemeService } from '../../shared/theme.service';

interface DashboardCard { label: string; value: number; icon: string; link: string; tone: string; }

@Component({
  imports: [RouterLink],
  selector: 'app-admin-dashboard',
  styleUrl: './admin-dashboard.css',
  templateUrl: './admin-dashboard.html',
})
export class AdminDashboard implements OnInit, AfterViewInit, OnDestroy {
  private readonly dashboardService = inject(AdminDashboardService);
  private readonly theme = inject(ThemeService);
  private chartContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('usersChart')
  private set usersChartContainer(container: ElementRef<HTMLDivElement> | undefined) {
    this.chartContainer = container;
    if (container && this.data()) {
      requestAnimationFrame(() => this.renderChart());
    }
  }
  protected readonly data = signal<AdminDashboardData | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly today = new Date();
  protected readonly formattedToday = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(this.today);
  private chart?: IChartApi;
  private resizeObserver?: ResizeObserver;
  private viewReady = false;

  constructor() {
    // La gráfica no lee CSS: al cambiar el tema se le pasan los colores nuevos.
    effect(() => this.chart?.applyOptions(this.chartTheme(this.theme.isDark())));
  }

  protected readonly cards = computed<DashboardCard[]>(() => {
    const counts = this.data()?.counts;
    if (!counts) return [];
    return [
      { label: 'Proveedores pendientes', value: counts.pendingProviders, icon: 'badge', link: '/admin/proveedores', tone: 'green' },
      { label: 'Grupos por aprobar', value: counts.pendingGroups, icon: 'groups', link: '/admin/grupos', tone: 'purple' },
      { label: 'Comisiones por revisar', value: counts.pendingCommissions, icon: 'request_quote', link: '/admin/comisiones', tone: 'orange' },
      { label: 'Incidencias escaladas', value: counts.escalatedIncidents, icon: 'support_agent', link: '/admin/incidencias', tone: 'red' },
    ];
  });

  ngOnInit(): void {
    this.dashboardService.getDashboard().subscribe({
      next: (data) => {
        this.data.set(data);
        this.loading.set(false);
        if (this.viewReady) requestAnimationFrame(() => this.renderChart());
      },
      error: (message: string) => { this.errorMessage.set(message); this.loading.set(false); },
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.data()) requestAnimationFrame(() => this.renderChart());
  }
  ngOnDestroy(): void { this.resizeObserver?.disconnect(); this.chart?.remove(); }

  protected activityIcon(type: AdminActivityType): string {
    return ({ USER: 'person_add', PROVIDER: 'badge', GROUP: 'groups', COMMISSION: 'request_quote', INCIDENT: 'support_agent' })[type];
  }

  protected relativeTime(value: string): string {
    const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return 'Ahora';
    const minutes = Math.floor(seconds / 60); if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60); if (hours < 24) return `Hace ${hours} h`;
    const days = Math.floor(hours / 24); return `Hace ${days} d`;
  }

  protected formatTime(value: string): string {
    return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  private chartTheme(dark: boolean) {
    const grid = dark ? 'rgba(255, 255, 255, 0.07)' : '#eef1f5';
    return {
      layout: { textColor: dark ? '#8fa9a1' : '#78819a' },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      crosshair: { vertLine: { color: '#00a982', labelBackgroundColor: '#087d66' }, horzLine: { color: dark ? 'rgba(255, 255, 255, 0.25)' : '#d9e1e8', labelBackgroundColor: '#087d66' } },
    };
  }

  private renderChart(): void {
    const container = this.chartContainer?.nativeElement;
    const dashboard = this.data();
    if (!container || !dashboard || this.chart) return;
    this.chart = createChart(container, {
      width: container.clientWidth,
      height: 190,
      ...this.chartTheme(this.theme.isDark()),
      layout: { ...this.chartTheme(this.theme.isDark()).layout, background: { type: ColorType.Solid, color: 'transparent' }, fontFamily: 'Inter, sans-serif', attributionLogo: true },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: .2, bottom: .08 } },
      timeScale: { borderVisible: false, timeVisible: false, rightOffset: 0, barSpacing: 38 },
      handleScroll: false,
      handleScale: false,
    });
    const series = this.chart.addSeries(AreaSeries, {
      lineColor: '#08b68c', topColor: 'rgba(8,182,140,.26)', bottomColor: 'rgba(8,182,140,.02)', lineWidth: 2,
      priceLineVisible: false,
    });
    series.setData(dashboard.users.growth.map((point) => ({ time: point.month as Time, value: point.total })));
    this.chart.timeScale().fitContent();
    this.resizeObserver = new ResizeObserver(() => this.chart?.applyOptions({ width: container.clientWidth }));
    this.resizeObserver.observe(container);
  }
}
