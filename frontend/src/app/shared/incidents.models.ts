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
  /** De qué se trata: el grupo (con el perfil de quien reportó) o la compra de mayoreo. */
  about: IncidentAbout | null;
  /** Última vez que escribió el responsable. */
  lastAssigneeReplyAt: string | null;
  /** Partly le pidió respuesta al responsable: cuándo, y hasta cuándo tiene (null si ya contestó o venció). */
  responseRequestedAt: string | null;
  responseDueAt: string | null;
}

/** ALL = lo ven todos; REPORTER / ASSIGNEE = privado entre Partly y esa persona. */
export type IncidentMessageAudience = 'ALL' | 'REPORTER' | 'ASSIGNEE';

export interface IncidentAbout {
  kind: 'GROUP' | 'WHOLESALE';
  platformName: string;
  platformLogoUrl: string | null;
  tierName: string;
  groupId: string | null;
  profileLabel: string | null;
  providerOrderId: string | null;
  /** El grupo usa una cuenta de mayoreo cuya contraseña administra Partly. */
  credentialsManagedByPartly: boolean;
}

export interface IncidentMessage {
  id: string;
  author: IncidentParty;
  body: string;
  createdAt: string;
  audience: IncidentMessageAudience;
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
