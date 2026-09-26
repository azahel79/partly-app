export type CommissionChargeStatus = 'PENDING' | 'IN_REVIEW' | 'PAID';
export type EarningStatus = 'ACCRUED' | 'BILLED' | 'SETTLED';

export interface MoneyBreakdown {
  gross: number;
  commission: number;
  net: number;
  payments: number;
}

export interface EarningsByGroup {
  groupId: string;
  platformName: string;
  tierName: string;
  status: string;
  payments: number;
  cyclesBilled: number;
  gross: number;
  commission: number;
  net: number;
  accountCost: number;
  accountCostFromWholesale: boolean;
  /** Lo cobrado menos comisión menos lo que costó la cuenta cada ciclo. */
  profit: number;
}

export interface CommissionRestriction {
  restricted: boolean;
  overdueAmount: number;
  since: string | null;
}

export interface EarningsSummary {
  totals: MoneyBreakdown;
  thisMonth: MoneyBreakdown;
  commission: {
    /** Ya generada pero todavía no exigible. */
    accrued: number;
    toPay: number;
    inReview: number;
    paid: number;
  };
  byGroup: EarningsByGroup[];
  restriction: CommissionRestriction;
  graceDays: number;
}

export interface EarningEntry {
  id: string;
  createdAt: string;
  groupId: string;
  platformName: string;
  tierName: string;
  buyerName: string;
  gross: number;
  commissionPercentage: number;
  commission: number;
  net: number;
  status: EarningStatus;
}

export interface EarningEntriesPage {
  data: EarningEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CommissionChargeGroup {
  groupId: string;
  platformName: string;
  tierName: string;
  payments: number;
  gross: number;
  commission: number;
}

export interface CommissionCharge {
  id: string;
  status: CommissionChargeStatus;
  amount: number;
  dueAt: string;
  payBy: string;
  overdue: boolean;
  hasReceipt: boolean;
  receiptUploadedAt: string | null;
  rejectionReason: string | null;
  paidAt: string | null;
  createdAt: string;
  groups: CommissionChargeGroup[];
}

export interface AdminCommissionCharge extends CommissionCharge {
  seller: { id: string; name: string; email: string; avatarUrl: string | null };
}

export interface PlatformBankAccount {
  holder: string;
  bankName: string;
  clabe: string;
  reference: string | null;
}

export interface MyCommissions {
  charges: CommissionCharge[];
  bankAccount: PlatformBankAccount | null;
  restriction: CommissionRestriction;
  graceDays: number;
}

/** Resumen liviano para el aviso del panel. */
export interface CommissionStatus {
  toPay: number;
  payBy: string | null;
  inReview: number;
  restricted: boolean;
}

export interface AdminCommissionsPage {
  data: AdminCommissionCharge[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminCommissionsSummary {
  pending: { count: number; amount: number };
  inReview: { count: number; amount: number };
  overdue: { count: number; amount: number };
  paidThisMonth: { count: number; amount: number };
  accruedNotBilled: number;
  restrictedSellers: number;
  graceDays: number;
}

export interface BankAccountInput {
  holder: string;
  bankName: string;
  clabe: string;
  reference?: string;
}
