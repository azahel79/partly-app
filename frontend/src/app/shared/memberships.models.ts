export interface MemberSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export type MembershipStatus = 'RESERVED' | 'ACTIVE' | 'PENDING_PAYMENT' | 'SUSPENDED' | 'CANCELLED';

/** Solo lo ve el vendedor en un grupo ya iniciado. */
export type RenewalStatus = 'RENEWED' | 'IN_REVIEW' | 'PENDING' | 'NOT_RENEWING' | 'RESERVED_NEXT';

export interface Membership {
  id: string;
  groupId: string;
  user: MemberSummary;
  status: MembershipStatus;
  autoRenew: boolean;
  joinedAt: string;
  leftAt: string | null;
  currentPeriodEnd: string;
  renewalStatus: RenewalStatus | null;
  profile: { id: string; label: string } | null;
}
