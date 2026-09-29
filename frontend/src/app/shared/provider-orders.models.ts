/** AWAITING_PAYMENT: reservada, falta transferir y subir comprobante · PENDING_APPROVAL: comprobante por validar · PENDING_DELIVERY: pago validado, falta entregar. */
export type ProviderOrderStatus = 'AWAITING_PAYMENT' | 'PENDING_APPROVAL' | 'PENDING_DELIVERY' | 'FULFILLED' | 'REJECTED' | 'CANCELLED';

export type ProviderOrderKind = 'PURCHASE' | 'RENEWAL' | 'REPLACEMENT';

export interface ProviderOrder {
  id: string;
  listing: {
    id: string;
    planId: string;
    tierName: string;
    maxSlots: number;
    officialPrice: string;
    platform: { id: string; name: string };
    providerProfile: { id: string; businessName: string };
  };
  unitPrice: string;
  status: ProviderOrderStatus;
  kind: ProviderOrderKind;
  createdAt: string;
  resultingGroupId: string | null;
  renewable: boolean;
  validityDays: number;
  /** Plazo para subir el comprobante antes de que la reserva se cancele sola. */
  paymentDueAt: string | null;
  hasReceipt: boolean;
  receiptUploadedAt: string | null;
  receiptRejectionReason: string | null;
  paidAt: string | null;
  /** Orden pagada y luego cancelada: null = el reembolso sigue pendiente. */
  refundedAt: string | null;
  /** Hasta cuándo sirve la cuenta entregada. */
  expiresAt: string | null;
  renewsOrderId: string | null;
  replacesOrderId: string | null;
  openFollowUp: { id: string; kind: 'RENEWAL' | 'REPLACEMENT'; status: ProviderOrderStatus } | null;
  /** Ya se entregó una reposición: esta cuenta quedó sustituida por la nueva. */
  replaced: boolean;
  /** Solo lo recibe el proveedor/ADMIN al abrir el detalle de una orden. */
  buyer?: ProviderOrderBuyer;
}

export interface ProviderOrderBuyer {
  id: string;
  name: string;
  email: string;
  memberSince: string;
  emailVerified: boolean;
  ownedGroups: number;
  completedPurchases: number;
  wholesale: { status: string | null; monthlyCap: number | null; usedThisMonth: number; metCount: number; total: number };
}

export interface CreateGroupFromProviderOrderInput {
  pricePerSlot: number;
  availableSlots: number;
  billingDay?: number;
  bankAccountNumber?: string;
}

export interface PaginatedProviderOrders {
  data: ProviderOrder[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProviderOrderCredential {
  username: string;
  password: string;
  notes: string | null;
  deliveredAt: string;
}

export interface DeliverProviderOrderCredentialInput {
  username: string;
  password: string;
  notes?: string;
}

/** Compra entregada que todavía se puede publicar como grupo (no es renovación ni fue sustituida por una reposición). */
export function isPublishable(order: ProviderOrder): boolean {
  return order.status === 'FULFILLED' && !order.resultingGroupId && order.kind !== 'RENEWAL' && !order.replaced;
}
