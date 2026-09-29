import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProviderOrdersService } from '../../shared/provider-orders.service';
import { ConfirmService } from '../../shared/confirm.service';
import { ProviderOrder, canUpdateCredential } from '../../shared/provider-orders.models';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';
import { MoneyPipe, formatMoney } from '../../shared/money';
import { DeliverCredentialsModal } from '../deliver-credentials-modal/deliver-credentials-modal';

const STATUS_LABEL: Record<ProviderOrder['status'], { label: string; tone: string }> = {
  AWAITING_PAYMENT: { label: 'Esperando el pago del comprador', tone: 'bg-slate-100 text-on-surface-variant' },
  PENDING_APPROVAL: { label: 'Comprobante por validar', tone: 'bg-blue-50 text-blue-700' },
  PENDING_DELIVERY: { label: 'Pago validado · por entregar', tone: 'bg-amber-50 text-amber-700' },
  FULFILLED: { label: 'Completada', tone: 'bg-emerald-50 text-emerald-700' },
  REJECTED: { label: 'Rechazada', tone: 'bg-red-50 text-red-700' },
  CANCELLED: { label: 'Cancelada', tone: 'bg-crema-inset text-on-surface-variant' },
};

const KIND_LABEL = { PURCHASE: 'Solicitud de compra', RENEWAL: 'Renovación', REPLACEMENT: 'Reposición' } as const;

const WHOLESALE_STATUS: Record<string, string> = {
  REQUESTED: 'Solicitó acceso',
  AUTHORIZED: 'Autorizado',
  REJECTED: 'Rechazado',
  REVOKED: 'Retirado',
};

@Component({
  imports: [RouterLink, PlatformLogo, MoneyPipe, DeliverCredentialsModal],
  selector: 'app-provider-order-detail',
  styleUrl: './provider-order-detail.css',
  templateUrl: './provider-order-detail.html',
})
export class ProviderOrderDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly providerOrdersService = inject(ProviderOrdersService);
  private readonly confirmService = inject(ConfirmService);

  protected readonly wholesaleStatus = WHOLESALE_STATUS;
  protected readonly order = signal<ProviderOrder | null | undefined>(undefined);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly working = signal(false);
  protected readonly viewingReceipt = signal(false);

  /** Modal de "Entregar credenciales" abierto. */
  protected readonly delivering = signal(false);
  /** 'update' = corregir el acceso de una cuenta ya entregada (p. ej. desde un reporte del vendedor). */
  protected readonly deliverMode = signal<'deliver' | 'update'>('deliver');
  protected readonly canUpdateCredential = canUpdateCredential;

  protected readonly status = computed(() => {
    const o = this.order();
    return o ? STATUS_LABEL[o.status] : null;
  });

  protected readonly title = computed(() => {
    const o = this.order();
    return o ? KIND_LABEL[o.kind] : '';
  });

  /** Lo que le deja a Partly vender esta cuenta frente a lo que cuesta oficialmente, para dimensionar el descuento que se le da al vendedor. */
  protected readonly discountPct = computed(() => {
    const o = this.order();
    if (!o) return 0;
    const official = Number(o.listing.officialPrice);
    return official > 0 ? Math.max(0, Math.round((1 - Number(o.unitPrice) / official) * 100)) : 0;
  });

  private get orderId(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.providerOrdersService.findById(this.orderId).subscribe({
      next: (order) => {
        this.order.set(order);
        // Desde un reporte se llega con ?accion=credenciales para abrir directo la actualización.
        if (this.route.snapshot.queryParamMap.get('accion') === 'credenciales' && canUpdateCredential(order)) this.openDelivery('update');
      },
      error: (message: string) => {
        this.order.set(null);
        this.errorMessage.set(message);
      },
    });
  }

  protected money(value: string | number): string {
    return formatMoney(value);
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  protected formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  private run(request: () => ReturnType<ProviderOrdersService['approve']>, after?: () => void): void {
    if (this.working()) return;
    this.working.set(true);
    this.errorMessage.set(null);
    request().subscribe({
      next: (updated) => {
        this.working.set(false);
        this.order.update((current) => ({ ...updated, buyer: updated.buyer ?? current?.buyer }));
        after?.();
      },
      error: (message: string) => {
        this.working.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected viewReceipt(): void {
    if (this.viewingReceipt()) return;
    this.viewingReceipt.set(true);
    this.providerOrdersService.getReceiptBlob(this.orderId).subscribe({
      next: (blob) => {
        this.viewingReceipt.set(false);
        window.open(URL.createObjectURL(blob), '_blank');
      },
      error: (message: string) => {
        this.viewingReceipt.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected async approve(): Promise<void> {
    const o = this.order();
    if (!o || this.working()) return;
    const ok = await this.confirmService.ask({
      title: `¿Ya llegaron ${this.money(o.unitPrice)} a tu banco?`,
      text: o.kind === 'RENEWAL' ? 'Al confirmar, la vigencia de la cuenta se alarga.' : 'Al confirmar pasa a entrega: podrás enviarle las credenciales.',
      confirmText: 'Sí, ya llegó',
    });
    if (!ok) return;
    this.run(() => this.providerOrdersService.approve(this.orderId));
  }

  protected async rejectReceipt(): Promise<void> {
    if (this.working()) return;
    const reason = await this.confirmService.prompt({
      title: 'Comprobante no válido',
      text: 'El comprador verá el motivo y podrá subir otro comprobante.',
      placeholder: 'Ej. El monto no coincide con lo que me llegó.',
      confirmText: 'Rechazar comprobante',
      required: true,
    });
    if (reason === null) return;
    this.run(() => this.providerOrdersService.rejectReceipt(this.orderId, reason));
  }

  protected async rejectRequest(): Promise<void> {
    if (this.working()) return;
    const reason = await this.confirmService.prompt({
      title: 'Rechazar la solicitud',
      text: 'La cuenta vuelve al inventario y el comprador verá el motivo.',
      placeholder: 'Motivo (opcional)',
      confirmText: 'Rechazar solicitud',
    });
    if (reason === null) return;
    this.run(() => this.providerOrdersService.reject(this.orderId, reason || undefined));
  }

  protected async cancelPaid(): Promise<void> {
    const o = this.order();
    if (!o || this.working()) return;
    const ok = await this.confirmService.ask({
      title: '¿Cancelar esta compra?',
      text: `El comprador ya pagó ${this.money(o.unitPrice)}. La cuenta vuelve al inventario y queda pendiente devolverle el dinero por transferencia.`,
      confirmText: 'Sí, cancelar',
      cancelText: 'Volver',
      danger: true,
    });
    if (!ok) return;
    this.run(() => this.providerOrdersService.cancel(this.orderId));
  }

  protected async markRefunded(): Promise<void> {
    const o = this.order();
    if (!o || this.working()) return;
    const ok = await this.confirmService.ask({
      title: '¿Ya le devolviste el dinero?',
      text: `Confirma que transferiste ${this.money(o.unitPrice)} al comprador.`,
      confirmText: 'Sí, ya lo devolví',
    });
    if (!ok) return;
    this.run(() => this.providerOrdersService.markRefunded(this.orderId));
  }

  protected openDelivery(mode: 'deliver' | 'update'): void {
    this.deliverMode.set(mode);
    this.delivering.set(true);
  }

  protected onDelivered(updated: ProviderOrder): void {
    this.delivering.set(false);
    this.order.update((current) => ({ ...updated, buyer: updated.buyer ?? current?.buyer }));
  }

}
