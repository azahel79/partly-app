import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { GroupsService } from '../../shared/groups.service';
import { IncidentsService } from '../../shared/incidents.service';
import { ProviderOrdersService } from '../../shared/provider-orders.service';
import { AuthService } from '../../shared/auth.service';
import { CreateIncidentInput } from '../../shared/incidents.models';

/** Algo sobre lo que se puede reportar: un grupo al que perteneces o una cuenta que compraste al mayoreo. */
interface ReportOption {
  key: string;
  kind: 'GROUP' | 'WHOLESALE';
  label: string;
  /** A quién le llega el reporte ("al vendedor…", "al equipo de Partly"). */
  recipient: string;
  input: Pick<CreateIncidentInput, 'context' | 'groupMembershipId' | 'providerOrderId'>;
  /** Para preseleccionar desde otra pantalla (?grupo= o ?compra=). */
  refId: string;
}

/**
 * Reportar un problema. El comprador lo hace sobre un grupo al que pertenece (le llega al vendedor); el vendedor,
 * además, sobre una cuenta que le compró a Partly al mayoreo (le llega al equipo de Partly).
 */
@Component({
  imports: [RouterLink],
  selector: 'app-support-new',
  templateUrl: './support-new.html',
})
export class SupportNew implements OnInit {
  private readonly groupsService = inject(GroupsService);
  private readonly incidentsService = inject(IncidentsService);
  private readonly providerOrdersService = inject(ProviderOrdersService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly groupOptions = signal<ReportOption[] | null>(null);
  protected readonly wholesaleOptions = signal<ReportOption[] | null>(null);
  protected readonly loaded = computed(() => this.groupOptions() !== null && this.wholesaleOptions() !== null);
  protected readonly hasOptions = computed(() => (this.groupOptions()?.length ?? 0) + (this.wholesaleOptions()?.length ?? 0) > 0);

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);

  protected readonly selectedKey = signal<string | null>(null);
  protected readonly subject = signal('');
  protected readonly message = signal('');

  protected readonly selected = computed(() => {
    const key = this.selectedKey();
    return [...(this.groupOptions() ?? []), ...(this.wholesaleOptions() ?? [])].find((o) => o.key === key) ?? null;
  });

  ngOnInit(): void {
    const userId = this.authService.currentUser()?.id;
    this.groupsService
      .findJoined()
      .pipe(
        switchMap((groups) =>
          groups.length === 0
            ? of([] as ReportOption[])
            : forkJoin(
                groups.map((group) =>
                  this.groupsService.findMembers(group.id).pipe(
                    map((members): ReportOption | null => {
                      const own = members.find((m) => m.user.id === userId);
                      return own
                        ? {
                            key: `g:${own.id}`,
                            kind: 'GROUP',
                            label: `${group.plan.platform.name} · ${group.plan.tierName}`,
                            recipient: `al vendedor (${group.owner.name})`,
                            input: { context: 'GROUP_MEMBERSHIP', groupMembershipId: own.id },
                            refId: group.id,
                          }
                        : null;
                    }),
                  ),
                ),
              ).pipe(map((results) => results.filter((r): r is ReportOption => r !== null))),
        ),
        catchError(() => of([] as ReportOption[])),
      )
      .subscribe((opts) => {
        this.groupOptions.set(opts);
        this.preselect();
      });

    // Cuentas del mayoreo ya entregadas (la vigente de cada una: sin renovaciones ni cuentas ya sustituidas).
    this.providerOrdersService
      .findMine('FULFILLED')
      .pipe(
        map((page) =>
          page.data
            .filter((o) => o.kind !== 'RENEWAL' && !o.replaced)
            .map((o): ReportOption => ({
              key: `w:${o.id}`,
              kind: 'WHOLESALE',
              label: `${o.listing.platform.name} · ${o.listing.tierName}`,
              recipient: 'al equipo de Partly',
              input: { context: 'PROVIDER_ORDER', providerOrderId: o.id },
              refId: o.id,
            })),
        ),
        catchError(() => of([] as ReportOption[])),
      )
      .subscribe((opts) => {
        this.wholesaleOptions.set(opts);
        this.preselect();
      });
  }

  /** Cuando ya cargó todo: lo que pidió la otra pantalla (?compra= o ?grupo=) o la primera opción. */
  private preselect(): void {
    if (!this.loaded() || this.selectedKey()) return;
    const params = this.route.snapshot.queryParamMap;
    const wanted = params.get('compra') ?? params.get('grupo');
    const all = [...(this.groupOptions() ?? []), ...(this.wholesaleOptions() ?? [])];
    this.selectedKey.set((wanted ? all.find((o) => o.refId === wanted) : null)?.key ?? all[0]?.key ?? null);
  }

  protected submit(): void {
    const option = this.selected();
    const subject = this.subject().trim();
    const message = this.message().trim();
    if (!option || subject.length < 3 || !message || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.incidentsService.create({ ...option.input, subject, message }).subscribe({
      next: (incident) => {
        this.submitting.set(false);
        this.router.navigate(['/panel/soporte', incident.id]);
      },
      error: (msg: string) => {
        this.submitting.set(false);
        this.errorMessage.set(msg);
      },
    });
  }
}
