export interface ProviderListingPlan {
  id: string;
  tierName: string;
  officialPrice: string;
  maxSlots: number;
  billingPeriod: string;
  platform: { id: string; name: string; logoUrl: string | null };
}

export interface ProviderListing {
  id: string;
  plan: ProviderListingPlan;
  providerProfile: { id: string; businessName: string };
  wholesalePrice: string;
  stockQuantity: number;
  active: boolean;
  /** Renovable = misma cuenta con renovación; no renovable = se cambia cada periodo. */
  renewable: boolean;
  validityDays: number;
  createdAt: string;
}

export interface CreateProviderListingInput {
  planId?: string;
  platformName?: string;
  tierName?: string;
  officialPrice?: number;
  maxSlots?: number;
  billingPeriod?: string;
  wholesalePrice: number;
  stockQuantity: number;
  renewable?: boolean;
  validityDays?: number;
}

export interface UpdateProviderListingInput {
  wholesalePrice?: number;
  stockQuantity?: number;
  active?: boolean;
  renewable?: boolean;
  validityDays?: number;
}

export interface PaginatedProviderListings {
  data: ProviderListing[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
