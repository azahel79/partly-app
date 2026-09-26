import { ApiProperty } from '@nestjs/swagger';
import { Plan, ProviderOrder, ProviderOrderStatus } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

class OrderListingSummaryDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  planId: string;

  @ApiProperty()
  @Expose()
  tierName: string;

  @ApiProperty()
  @Expose()
  maxSlots: number;

  @ApiProperty({ example: '99.00' })
  @Expose()
  officialPrice: string;

  @ApiProperty()
  @Expose()
  platform: { id: string; name: string };

  @ApiProperty()
  @Expose()
  providerProfile: { id: string; businessName: string };
}

type FollowUp = { id: string; status: ProviderOrderStatus };

type OrderWithRelations = ProviderOrder & {
  listing: {
    id: string;
    plan: Pick<Plan, 'id' | 'tierName' | 'maxSlots' | 'officialPrice'> & { platform: { id: string; name: string } };
    providerProfile: { id: string; businessName: string };
  };
  renewals?: FollowUp[];
  replacements?: FollowUp[];
};

export interface ProviderOrderBuyerInfo {
  id: string;
  name: string;
  email: string;
  memberSince: Date;
  emailVerified: boolean;
  ownedGroups: number;
  completedPurchases: number;
  wholesale: { status: string | null; monthlyCap: number | null; usedThisMonth: number; metCount: number; total: number };
}

export type ProviderOrderKind = 'PURCHASE' | 'RENEWAL' | 'REPLACEMENT';

const OPEN_STATUSES: ProviderOrderStatus[] = [
  ProviderOrderStatus.AWAITING_PAYMENT,
  ProviderOrderStatus.PENDING_APPROVAL,
  ProviderOrderStatus.PENDING_DELIVERY,
];

@Exclude()
export class ProviderOrderResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-6d2a-4c7a-9f2e-2a6b9b1e2b10' })
  @Expose()
  id: string;

  @ApiProperty({ type: OrderListingSummaryDto })
  @Expose()
  listing: OrderListingSummaryDto;

  @ApiProperty({ example: '45.00' })
  @Expose()
  unitPrice: string;

  @ApiProperty({ enum: ProviderOrderStatus, example: ProviderOrderStatus.PENDING_DELIVERY })
  @Expose()
  status: ProviderOrderStatus;

  @ApiProperty({ enum: ['PURCHASE', 'RENEWAL', 'REPLACEMENT'], description: 'Compra nueva, renovación de una cuenta que ya tienes, o reposición de una que venció.' })
  @Expose()
  kind: ProviderOrderKind;

  @ApiProperty({ example: '2026-09-13T10:00:00.000Z' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ nullable: true, description: 'ID del grupo creado a partir de esta compra, si ya se creó uno.' })
  @Expose()
  resultingGroupId: string | null;

  @ApiProperty({ description: 'Renovable = misma cuenta con renovación; no renovable = se cambia cada periodo.' })
  @Expose()
  renewable: boolean;

  @ApiProperty({ example: 30 })
  @Expose()
  validityDays: number;

  @ApiProperty({ nullable: true, description: 'Hasta cuándo puede subir su comprobante antes de que se cancele la reserva.' })
  @Expose()
  paymentDueAt: Date | null;

  @ApiProperty()
  @Expose()
  hasReceipt: boolean;

  @ApiProperty({ nullable: true })
  @Expose()
  receiptUploadedAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Por qué se rechazó el último comprobante, si se rechazó.' })
  @Expose()
  receiptRejectionReason: string | null;

  @ApiProperty({ nullable: true, description: 'Cuándo se validó el pago.' })
  @Expose()
  paidAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Si se canceló ya pagada: cuándo se le devolvió el dinero (null = reembolso pendiente).' })
  @Expose()
  refundedAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Hasta cuándo sirve la cuenta entregada.' })
  @Expose()
  expiresAt: Date | null;

  @ApiProperty({ nullable: true })
  @Expose()
  renewsOrderId: string | null;

  @ApiProperty({ nullable: true })
  @Expose()
  replacesOrderId: string | null;

  @ApiProperty({ nullable: true, description: 'Renovación o reposición en curso de esta cuenta, si la hay.' })
  @Expose()
  openFollowUp: { id: string; kind: 'RENEWAL' | 'REPLACEMENT'; status: ProviderOrderStatus } | null;

  @ApiProperty({ description: 'true si ya se entregó una reposición: esta cuenta quedó sustituida por la nueva.' })
  @Expose()
  replaced: boolean;

  @ApiProperty({ required: false, description: 'Quién compra — solo lo ven el proveedor y los ADMIN, nunca el comprador.' })
  @Expose()
  buyer?: ProviderOrderBuyerInfo;

  constructor(order: OrderWithRelations, buyer?: ProviderOrderBuyerInfo) {
    this.buyer = buyer;
    this.id = order.id;
    this.listing = {
      id: order.listing.id,
      planId: order.listing.plan.id,
      tierName: order.listing.plan.tierName,
      maxSlots: order.listing.plan.maxSlots,
      officialPrice: order.listing.plan.officialPrice.toString(),
      platform: order.listing.plan.platform,
      providerProfile: order.listing.providerProfile,
    };
    this.unitPrice = order.unitPrice.toString();
    this.status = order.status;
    this.kind = order.renewsOrderId ? 'RENEWAL' : order.replacesOrderId ? 'REPLACEMENT' : 'PURCHASE';
    this.createdAt = order.createdAt;
    this.resultingGroupId = order.resultingGroupId;
    this.renewable = order.renewable;
    this.validityDays = order.validityDays;
    this.paymentDueAt = order.paymentDueAt;
    this.hasReceipt = order.receiptPath !== null;
    this.receiptUploadedAt = order.receiptUploadedAt;
    this.receiptRejectionReason = order.receiptRejectionReason;
    this.paidAt = order.paidAt;
    this.refundedAt = order.refundedAt;
    this.expiresAt = order.expiresAt;
    this.renewsOrderId = order.renewsOrderId;
    this.replacesOrderId = order.replacesOrderId;

    const openRenewal = order.renewals?.find((r) => OPEN_STATUSES.includes(r.status));
    const openReplacement = order.replacements?.find((r) => OPEN_STATUSES.includes(r.status));
    this.openFollowUp = openRenewal
      ? { id: openRenewal.id, kind: 'RENEWAL', status: openRenewal.status }
      : openReplacement
        ? { id: openReplacement.id, kind: 'REPLACEMENT', status: openReplacement.status }
        : null;
    this.replaced = (order.replacements ?? []).some((r) => r.status === ProviderOrderStatus.FULFILLED);
  }
}
