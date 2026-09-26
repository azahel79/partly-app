export type WholesaleAccessStatus = 'REQUESTED' | 'AUTHORIZED' | 'REJECTED' | 'REVOKED';

export interface WholesaleRequirement {
  key: 'email' | 'phone' | 'group' | 'reviews' | 'rating' | 'incidents' | 'commission';
  label: string;
  hint: string;
  met: boolean;
  /** Avance hacia la meta (ej. 1 de 2 ciclos). */
  current: number;
  target: number;
}

/** Lo que ve el vendedor: si puede comprar al mayoreo y qué le falta para lograrlo. */
export interface MyWholesaleAccess {
  /** null = nunca lo ha pedido. */
  status: WholesaleAccessStatus | null;
  authorized: boolean;
  monthlyCap: number | null;
  usedThisMonth: number;
  note: string | null;
  requestedAt: string | null;
  requirements: WholesaleRequirement[];
  metCount: number;
  total: number;
  canRequest: boolean;
}

export interface AdminWholesaleAccessRow {
  user: { id: string; name: string; email: string; avatarUrl: string | null; memberSince: string };
  status: WholesaleAccessStatus | null;
  monthlyCap: number | null;
  usedThisMonth: number;
  note: string | null;
  requestedAt: string | null;
  reviewedAt: string | null;
  requirements: WholesaleRequirement[];
  metCount: number;
  total: number;
}

export interface AdminWholesaleAccessPage {
  data: AdminWholesaleAccessRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  suggestedCap: number;
}

export interface ReviewWholesaleAccessInput {
  status: 'AUTHORIZED' | 'REJECTED' | 'REVOKED';
  monthlyCap?: number;
  note?: string;
}
