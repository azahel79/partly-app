export type ProviderProfileStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';

export interface ProviderProfile {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string } | null;
  businessName: string;
  status: ProviderProfileStatus;
  createdAt: string;
}

export interface PaginatedProviderProfiles {
  data: ProviderProfile[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
