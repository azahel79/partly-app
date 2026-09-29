export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  authProvider: string;
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
  payoutAccountType: 'CLABE' | 'DEBIT_CARD' | null;
  payoutAccountNumberLast4: string | null;
  payoutVerified: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: AuthUser;
}
