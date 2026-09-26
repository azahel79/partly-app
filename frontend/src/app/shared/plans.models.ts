export interface Plan {
  id: string;
  platform: { id: string; name: string };
  tierName: string;
  officialPrice: string;
  maxSlots: number;
  billingPeriod: string;
  commissionPercentage: string;
  active: boolean;
}

export interface PaginatedPlans {
  data: Plan[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
