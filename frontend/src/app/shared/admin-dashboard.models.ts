export type AdminActivityType = 'USER' | 'PROVIDER' | 'GROUP' | 'COMMISSION' | 'INCIDENT';

export interface AdminDashboardData {
  generatedAt: string;
  counts: {
    pendingProviders: number;
    pendingGroups: number;
    pendingCommissions: number;
    pendingWholesaleAccess: number;
    pendingOrderPayments: number;
    escalatedIncidents: number;
    totalUsers: number;
  };
  users: {
    monthlyChange: number;
    currentMonth: number;
    previousMonth: number;
    growth: Array<{ month: string; total: number; newUsers: number }>;
  };
  activity: Array<{
    id: string;
    type: AdminActivityType;
    title: string;
    detail: string;
    createdAt: string;
    route: string;
  }>;
}
