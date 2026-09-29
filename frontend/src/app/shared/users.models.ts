export type Role = 'USER' | 'ADMIN';
export type AuthProvider = 'LOCAL' | 'GOOGLE';
export type PayoutAccountType = 'CLABE' | 'DEBIT_CARD';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  authProvider: AuthProvider;
  emailVerified: boolean;
  avatarUrl: string | null;
  ratingAvg: string;
  marketingOptOut: boolean;
  emailNotifications: boolean;
  inAppNotifications: boolean;
  notifyPayments: boolean;
  notifyGroups: boolean;
  notifyCredentials: boolean;
  notifyPayouts: boolean;
  profileNameVisible: boolean;
  profileAvatarVisible: boolean;
  timezone: string;
  payoutAccountHolder: string | null;
  payoutBankName: string | null;
  payoutAccountType: PayoutAccountType | null;
  payoutAccountNumberLast4: string | null;
  payoutVerified: boolean;
  createdAt: string;
}

export interface ProfileUpdate {
  name?: string;
  phone?: string;
  avatarUrl?: string;
  clearAvatar?: boolean;
  currentPassword?: string;
  newPassword?: string;
  marketingOptOut?: boolean;
  emailNotifications?: boolean;
  inAppNotifications?: boolean;
  notifyPayments?: boolean;
  notifyGroups?: boolean;
  notifyCredentials?: boolean;
  notifyPayouts?: boolean;
  profileNameVisible?: boolean;
  profileAvatarVisible?: boolean;
  timezone?: string;
  payoutAccountHolder?: string;
  payoutBankName?: string;
  payoutAccountType?: PayoutAccountType;
  payoutAccountNumber?: string;
  clearPayoutAccount?: boolean;
}

export interface TrustSummary {
  ownedGroups: number;
  activeMemberships: number;
  paidPayments: number;
  reviewsWritten: number;
  payoutRequests: number;
}

export interface AccountSession {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface PaginatedUsers {
  data: AdminUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListUsersQuery {
  role?: Role;
  authProvider?: AuthProvider;
  search?: string;
  page?: number;
  limit?: number;
}
