export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED';

export interface Payment {
  id: string;
  amount: string;
  status: PaymentStatus;
  graceUntil: string | null;
  paidAt: string | null;
  receiptUploadedAt: string | null;
  /** Periodo que cubre este pago (en una entrada tardía es solo lo que resta del ciclo). */
  coveredFrom: string | null;
  coveredUntil: string | null;
  /** Días que cubre cuando entró a mitad de ciclo; null = ciclo completo. */
  proratedDays: number | null;
  /** También pagó el ciclo siguiente completo (entró con muy pocos días restantes). */
  includesNextCycle: boolean;
}

export interface PendingPayment extends Payment {
  member: { id: string; name: string; avatarUrl: string | null };
  /** PENDING_PAYMENT = primer pago: hay que asignarle un perfil al aprobar. ACTIVE = renovación, ya tiene uno. */
  membershipStatus: 'ACTIVE' | 'PENDING_PAYMENT' | 'SUSPENDED' | 'CANCELLED';
}

export interface PaginatedPendingPayments {
  data: PendingPayment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type AdminReceiptFilter = '' | 'UPLOADED' | 'MISSING';

export interface AdminPayment {
  id: string;
  amount: string;
  status: PaymentStatus;
  receiptUploadedAt: string | null;
  paidAt: string | null;
  graceUntil: string | null;
  requestedAt: string;
  membershipStatus: 'ACTIVE' | 'PENDING_PAYMENT' | 'SUSPENDED' | 'CANCELLED';
  group: {
    id: string;
    platform: { id: string; name: string; logoUrl: string | null };
    planName: string;
  };
  buyer: { id: string; name: string; email: string; avatarUrl: string | null };
  seller: { id: string; name: string; email: string };
}

export interface AdminPaymentsPage {
  data: AdminPayment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  counts: { missingReceipt: number; awaitingSeller: number; approved: number; failed: number };
}
