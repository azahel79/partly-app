export interface Wallet {
  id: string;
  balance: string;
  currency: string;
}

export interface WalletTransaction {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  amount: string;
  relatedRef: string | null;
  createdAt: string;
}

export interface PaginatedWalletTransactions {
  data: WalletTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
