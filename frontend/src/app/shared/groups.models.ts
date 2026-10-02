export interface GroupPlanSummary {
  id: string;
  tierName: string;
  billingPeriod: string;
  platform: { id: string; name: string; logoUrl: string | null; categoryName: string | null };
}

export interface GroupOwnerSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  ratingAvg: string;
  memberSince: string;
  emailVerified: boolean;
}

export type GroupStatus = 'SEARCHING_MEMBERS' | 'READY_TO_START' | 'ACTIVE' | 'FULL' | 'PAUSED' | 'CANCELLED';
export type GroupApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type CredentialReviewStatus = 'NOT_REQUESTED' | 'REQUESTED' | 'SUBMITTED' | 'APPROVED';

export interface Group {
  id: string;
  plan: GroupPlanSummary;
  owner: GroupOwnerSummary;
  pricePerSlot: string;
  availableSlots: number;
  occupiedSlots: number;
  status: GroupStatus;
  approvalStatus: GroupApprovalStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  hasCredentials: boolean;
  credentialReviewStatus: CredentialReviewStatus;
  credentialsRequestedAt: string | null;
  credentialsSubmittedAt: string | null;
  credentialsReviewedAt: string | null;
  billingDay: number;
  bankAccountNumber: string | null;
  nextRenewalDate: string;
  createdAt: string;
  commissionPercentage: string | null;
  /** Cómo reciben el acceso los miembros: correo y contraseña, o link de invitación al grupo familiar. */
  accessType: 'CREDENTIALS' | 'INVITE_LINK';
  /** Cuenta de mayoreo de la que salió el grupo (solo la ven el vendedor y Tequio). */
  wholesaleAccount?: {
    orderId: string;
    expiresAt: string | null;
    renewable: boolean;
    expired: boolean;
    /** false = no se cobra la renovación a los miembros hasta que el vendedor la renueve o la reponga. */
    coversNextPeriod: boolean;
    /** Entregada con credenciales: la contraseña la cambia Tequio (el vendedor se la pide desde un reporte). */
    managedByPartly: boolean;
  } | null;
  /** Cupos ya apartados (reservados o pagando): el avance hacia el 75% antes de iniciar. */
  reservedSlots: number;
  /** Apartados que aún no son miembros activos (reservados o pagando). */
  heldSlots: number;
  /** Cupos que de verdad se pueden tomar ahora. */
  freeSlots: number;
  /** false = ya inició y le quedan menos días de los mínimos para entrar: hay que esperar a que renueve. */
  canJoinNow: boolean;
  /** Días que le quedan al ciclo en curso (solo grupos ya iniciados). */
  daysUntilRenewal: number | null;
  minEntryDays: number | null;
  /** Lugares que se liberan al terminar el ciclo (miembros que no renovarán) y que todavía se pueden apartar sin pagar. */
  freeingSlots: number;
  /** Cuándo se libera el primero de esos lugares. */
  freeingDate: string | null;
  /** Personas que ya apartaron uno de esos lugares. */
  nextCycleReserved: number;
  /** Cuándo arrancó el servicio. Null mientras el grupo sigue juntando cupos reservados. */
  startedAt: string | null;
}

/** Números que ve el vendedor antes de decidir si inicia su grupo. */
export interface GroupStartRevenue {
  slots: number;
  gross: number;
  commission: number | null;
  net: number | null;
  profit: number | null;
}

export interface GroupStartPreview {
  groupId: string;
  platformName: string;
  tierName: string;
  status: GroupStatus;
  startedAt: string | null;
  availableSlots: number;
  reservedSlots: number;
  /** Apartados que aún no son miembros activos (reservados o pagando). */
  heldSlots: number;
  /** Cupos que de verdad se pueden tomar ahora. */
  freeSlots: number;
  /** false = ya inició y le quedan menos días de los mínimos para entrar: hay que esperar a que renueve. */
  canJoinNow: boolean;
  /** Días que le quedan al ciclo en curso (solo grupos ya iniciados). */
  daysUntilRenewal: number | null;
  minEntryDays: number | null;
  requiredSlots: number;
  canStart: boolean;
  pricePerSlot: number;
  commissionPercentage: number | null;
  accountCost: number;
  accountCostFromWholesale: boolean;
  now: GroupStartRevenue;
  full: GroupStartRevenue;
  renewalDateIfStartedNow: string;
}

/** Cuánto pagaría quien quiere entrar y por qué (solo los días que restan del ciclo en curso). */
export interface GroupJoinPreview {
  groupId: string;
  platformName: string;
  fullPrice: number;
  /** false = el vendedor aún no inicia el grupo: reservar no cuesta nada todavía. */
  started: boolean;
  /** Motivo por el que hoy no se puede entrar (ej. el vendedor tiene una comisión vencida); null = se puede. */
  unavailableReason: string | null;
  payNow: boolean;
  amountToPay: number;
  totalDays: number | null;
  remainingDays: number | null;
  isProrated: boolean;
  prorationAmount: number;
  includesNextCycle: boolean;
  /** false = quedan menos días de los mínimos: se puede entrar cuando el grupo renueve (firstRenewalDate). */
  canJoinNow: boolean;
  minEntryDays: number | null;
  coveredUntil: string | null;
  firstRenewalDate: string | null;
  /** true = hoy no hay cupo que tomar, pero se libera uno al terminar el ciclo: se aparta sin pagar ahora. */
  reserveFreeingSeat: boolean;
  freeingDate: string | null;
}

export interface CreateGroupInput {
  planId?: string;
  platformName?: string;
  tierName?: string;
  maxSlots?: number;
  officialPrice?: number;
  pricePerSlot: number;
  availableSlots: number;
  /** Opcional: el día de cobro real se fija cuando el vendedor inicia el grupo. */
  billingDay?: number;
  bankAccountNumber?: string;
  /** Cada cuánto se cobra (1, 2, 3, 6 o 12 meses). */
  billingPeriod?: 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
  /** Solo YouTube, Spotify y Canva pueden dar acceso con link de invitación. */
  accessType?: 'CREDENTIALS' | 'INVITE_LINK';
}

/** Solo para el panel de staff — `GET /groups/admin/:id`. Trae campos que el endpoint público no expone. */
export interface AdminGroupDetail extends Group {
  internalNotes: string | null;
  sellerSalesCount: number;
}

export interface GroupProfile {
  id: string;
  label: string;
  assignedTo: { membershipId: string; userId: string; userName: string } | null;
}

export interface PaginatedGroups {
  data: Group[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Tu lugar en otro grupo de la misma plataforma (para avisarte antes de apartar uno más). */
export interface SimilarMembership {
  groupId: string;
  platformName: string;
  tierName: string;
  pricePerSlot: string;
  billingPeriod: string;
  status: 'RESERVED' | 'PENDING_PAYMENT' | 'ACTIVE' | 'SUSPENDED';
  /** Solo si todavía no lo pagaste: te puedes cambiar soltando ese lugar. */
  canSwitch: boolean;
}

/** Un lugar que apartaste o estás pagando (todavía no es una membresía activa). */
export interface ReservedSeat {
  group: Group;
  membership: {
    status: 'RESERVED' | 'PENDING_PAYMENT';
    joinedAt: string;
    /** Apartaste un lugar que se libera al terminar el ciclo de un grupo ya iniciado. */
    waitingForSeat: boolean;
    freeingDate: string | null;
    payment: { amount: string; graceUntil: string | null; receiptUploadedAt: string | null } | null;
  };
}
