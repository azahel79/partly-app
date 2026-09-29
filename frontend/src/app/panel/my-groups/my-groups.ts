import { afterNextRender, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GroupsService } from '../../shared/groups.service';
import { Group, ReservedSeat } from '../../shared/groups.models';
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
  /** Lugares apartados o pendientes de pago (todavía no son membresías activas). */
  protected readonly reservedSeats = signal<ReservedSeat[] | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly noticeMessage = signal<string | null>(null);

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
    this.groupsService.findReserved().subscribe({
      next: (seats) => this.reservedSeats.set(seats),
      error: () => this.reservedSeats.set([]),
    });
  }

  /** Etiqueta de estado de un lugar apartado. */
  protected seatStatus(seat: ReservedSeat): { label: string; tone: string } {
    const m = seat.membership;
    if (m.status === 'PENDING_PAYMENT') {
      if (m.payment?.receiptUploadedAt) return { label: 'Comprobante en revisión', tone: 'ui-pill--info' };
      return { label: m.payment?.graceUntil ? `Falta pagar · hasta el ${this.dateTime(m.payment.graceUntil)}` : 'Falta pagar', tone: 'ui-pill--warn' };
    }
    if (m.waitingForSeat) {
      return { label: m.freeingDate ? `Se libera el ${this.calendarDate(m.freeingDate)}` : 'Lugar por liberarse', tone: 'ui-pill--violet' };
    }
    return { label: 'Apartado · no pagas hasta que inicie', tone: 'ui-pill--info' };
  }

  protected async leaveSeat(seat: ReservedSeat): Promise<void> {
    if (this.leavingId()) {
      return;
    }
    const group = seat.group;
    const ok = await this.confirmService.ask({
      title: `¿Soltar tu lugar en ${group.plan.platform.name}?`,
      text: 'Quedará libre para otra persona. Si luego cambias de opinión, tendrás que apartarlo de nuevo (si todavía hay lugar).',
      confirmText: 'Sí, soltar mi lugar',
      cancelText: 'Conservarlo',
      danger: true,
    });
    if (!ok) {
      return;
    }
    this.leavingId.set(group.id);
    this.groupsService.leave(group.id).subscribe({
      next: () => {
        this.leavingId.set(null);
        this.reservedSeats.update((seats) => (seats ?? []).filter((s) => s.group.id !== group.id));
      },
      error: (message: string) => {
        this.leavingId.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  /** Fechas de corte a medianoche UTC: se muestran en UTC para no correrse un día. */
  private calendarDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
  }

  private dateTime(iso: string): string {
    return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).replace('.', '');
  }

  /** Apaga la renovación: conserva el acceso hasta el corte y ahí se libera su lugar solo. */
  private leaveAtPeriodEnd(group: Group, periodEnd: string): void {
    this.leavingId.set(group.id);
    this.errorMessage.set(null);
    this.groupsService.setAutoRenew(group.id, false).subscribe({
      next: () => {
        this.leavingId.set(null);
        this.noticeMessage.set(`Listo: sigues en ${group.plan.platform.name} hasta el ${this.calendarDate(periodEnd)} y ya no se te cobrará el siguiente periodo. Si cambias de opinión, vuelve a activar la renovación en el detalle del grupo.`);
      },
      error: (message: string) => {
        this.leavingId.set(null);
        this.errorMessage.set(message);
      },
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

  /**
   * Quien ya pagó casi siempre prefiere salir al terminar su periodo (apagar la renovación: conserva el acceso que
   * pagó y no se le cobra más). Salir ahora le quita el acceso hoy y no hay reembolso: el pago fue directo al vendedor.
   */
  protected async leaveGroup(group: Group): Promise<void> {
    if (this.leavingId()) {
      return;
    }
    this.closeMenu();
    const platform = group.plan.platform.name;
    this.leavingId.set(group.id);
    let membership: { status: string; currentPeriodEnd: string; autoRenew: boolean } | null = null;
    try {
      membership = await firstValueFrom(this.groupsService.findMyMembership(group.id));
    } catch (message) {
      this.leavingId.set(null);
      this.errorMessage.set(String(message));
      return;
    }
    this.leavingId.set(null);

    const periodEnd = membership?.currentPeriodEnd ?? null;
    const canWaitForPeriodEnd = membership?.status === 'ACTIVE' && !!periodEnd && new Date(periodEnd).getTime() > Date.now();
    const noRefund = 'No hay reembolso de los días que ya pagaste: tu pago fue directo al vendedor.';

    if (canWaitForPeriodEnd && membership!.autoRenew) {
      const choice = await this.confirmService.choose({
        title: `¿Salir del grupo de ${platform}?`,
        text: `Te recomendamos salir al terminar tu periodo: sigues usando la cuenta hasta el ${this.calendarDate(periodEnd!)} y ya no se te cobra el siguiente. Si sales ahora pierdes el acceso hoy. ${noRefund}`,
        primaryText: 'Salir al terminar mi periodo',
        secondaryText: 'Salir ahora',
        cancelText: 'Quedarme',
      });
      if (choice === 'primary') {
        this.leaveAtPeriodEnd(group, periodEnd!);
        return;
      }
      if (choice === 'cancel') {
        return;
      }
    }

    const ok = await this.confirmService.ask({
      title: `¿Salir hoy del grupo de ${platform}?`,
      text: canWaitForPeriodEnd && !membership!.autoRenew
        ? `Ya apagaste tu renovación: sales solo el ${this.calendarDate(periodEnd!)} y mientras tanto sigues usando la cuenta. Si sales ahora pierdes el acceso hoy. ${noRefund}`
        : `Pierdes tu lugar y el acceso a la cuenta hoy mismo. ${noRefund}`,
      confirmText: 'Sí, salir ahora',
      cancelText: 'Quedarme',
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
