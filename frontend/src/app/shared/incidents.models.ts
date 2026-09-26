export type IncidentContext = 'GROUP_MEMBERSHIP' | 'PROVIDER_ORDER';
export type IncidentStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'ESCALATED';

export interface IncidentParty {
  id: string;
  name: string;
}

export interface Incident {
  id: string;
  context: IncidentContext;
  groupMembershipId: string | null;
  providerOrderId: string | null;
  reportedBy: IncidentParty;
  assignedTo: IncidentParty;
  subject: string;
  status: IncidentStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export interface IncidentMessage {
  id: string;
  author: IncidentParty;
  body: string;
  createdAt: string;
}

export interface PaginatedIncidents {
  data: Incident[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateIncidentInput {
  context: IncidentContext;
  groupMembershipId?: string;
  providerOrderId?: string;
  subject: string;
  message: string;
}
