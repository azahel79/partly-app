export type NotificationType =
  | 'CREDENTIAL_UPDATED'
  | 'PAYMENT_DUE_SOON'
  | 'PAYMENT_FAILED'
  | 'MEMBERSHIP_CANCELLED'
  | 'PAYOUT_PAID'
  | 'SYSTEM'
  | 'PROVIDER_STATUS_CHANGED'
  | 'PROVIDER_ORDER_PLACED'
  | 'PROVIDER_ORDER_APPROVED'
  | 'PROVIDER_ORDER_REJECTED'
  | 'PROVIDER_ORDER_DELIVERED'
  | 'INCIDENT_OPENED'
  | 'INCIDENT_MESSAGE'
  | 'INCIDENT_STATUS_CHANGED'
  | 'PAYMENT_RECEIPT_UPLOADED'
  | 'PAYMENT_RECEIPT_REJECTED'
  | 'PAYMENT_CONFIRMED'
  | 'COMMISSION_DUE'
  | 'COMMISSION_REMINDER'
  | 'COMMISSION_OVERDUE'
  | 'COMMISSION_RECEIPT_UPLOADED'
  | 'COMMISSION_PAID'
  | 'COMMISSION_REJECTED'
  | 'PROVIDER_ORDER_RECEIPT_UPLOADED'
  | 'PROVIDER_ORDER_RECEIPT_REJECTED'
  | 'PROVIDER_ORDER_EXPIRING'
  | 'PROVIDER_ORDER_EXPIRED'
  | 'PROVIDER_ORDER_CANCELLED'
  | 'WHOLESALE_ACCESS_REQUESTED'
  | 'WHOLESALE_ACCESS_APPROVED'
  | 'WHOLESALE_ACCESS_REJECTED'
  | 'GROUP_READY_TO_START'
  | 'GROUP_FULL'
  | 'GROUP_START_REMINDER';

export interface Notification {
  id: string;
  type: NotificationType;
  payload: string;
  readAt: string | null;
  groupId: string | null;
  /** Plataforma y plan del grupo al que se refiere ('Netflix · Premium 4 pantallas'), si aplica. */
  groupLabel: string | null;
  createdAt: string;
}

export interface PaginatedNotifications {
  data: Notification[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
  totalPages: number;
}
