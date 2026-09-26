import { Notification, NotificationType } from './notifications.models';

/** Desde dónde se ve la notificación: cambia el destino al que lleva y el título que se le pone. */
export type NotificationArea = 'panel' | 'admin';

export type NotificationCategory = 'groups' | 'payments' | 'wholesale' | 'support' | 'system';

export interface NotificationTarget {
  /** Ruta completa (se pasa a router.navigate). */
  commands: string[];
  label: string;
}

const PANEL_ICONS: Record<NotificationType, string> = {
  CREDENTIAL_UPDATED: 'lock',
  PAYMENT_DUE_SOON: 'schedule',
  PAYMENT_FAILED: 'error',
  MEMBERSHIP_CANCELLED: 'person_remove',
  PAYOUT_PAID: 'account_balance_wallet',
  SYSTEM: 'info',
  PROVIDER_STATUS_CHANGED: 'verified',
  PROVIDER_ORDER_PLACED: 'shopping_cart',
  PROVIDER_ORDER_APPROVED: 'task_alt',
  PROVIDER_ORDER_REJECTED: 'cancel',
  PROVIDER_ORDER_DELIVERED: 'local_shipping',
  INCIDENT_OPENED: 'report',
  INCIDENT_MESSAGE: 'chat',
  INCIDENT_STATUS_CHANGED: 'flag',
  PAYMENT_RECEIPT_UPLOADED: 'receipt_long',
  PAYMENT_RECEIPT_REJECTED: 'cancel',
  PAYMENT_CONFIRMED: 'check_circle',
  COMMISSION_DUE: 'request_quote',
  COMMISSION_REMINDER: 'schedule',
  COMMISSION_OVERDUE: 'block',
  COMMISSION_RECEIPT_UPLOADED: 'receipt_long',
  COMMISSION_PAID: 'verified',
  COMMISSION_REJECTED: 'cancel',
  PROVIDER_ORDER_RECEIPT_UPLOADED: 'receipt_long',
  PROVIDER_ORDER_RECEIPT_REJECTED: 'cancel',
  PROVIDER_ORDER_EXPIRING: 'schedule',
  PROVIDER_ORDER_EXPIRED: 'event_busy',
  PROVIDER_ORDER_CANCELLED: 'cancel',
  WHOLESALE_ACCESS_REQUESTED: 'verified_user',
  WHOLESALE_ACCESS_APPROVED: 'verified_user',
  WHOLESALE_ACCESS_REJECTED: 'gpp_bad',
  GROUP_READY_TO_START: 'rocket_launch',
  GROUP_FULL: 'groups',
  GROUP_START_REMINDER: 'hourglass_top',
};

const isGroupStartNotice = (type: NotificationType): boolean =>
  type === 'GROUP_READY_TO_START' || type === 'GROUP_FULL' || type === 'GROUP_START_REMINDER';

export function notificationIcon(n: Notification, area: NotificationArea): string {
  if (area === 'admin') {
    if (n.type === 'PROVIDER_ORDER_PLACED') return 'shopping_cart';
    if (n.type.startsWith('PROVIDER_')) return 'storefront';
    if (n.type.startsWith('INCIDENT_')) return 'support_agent';
    if (n.type.startsWith('PAYMENT_')) return 'receipt_long';
    if (n.type.startsWith('WHOLESALE_ACCESS_')) return 'verified_user';
    if (n.type.startsWith('COMMISSION_')) return 'request_quote';
    if (n.type === 'PAYOUT_PAID') return 'payments';
    return n.groupId ? 'groups' : 'info';
  }
  return PANEL_ICONS[n.type] ?? 'notifications';
}

export function notificationTitle(n: Notification, area: NotificationArea): string {
  if (area === 'admin') {
    if (n.type === 'PROVIDER_ORDER_PLACED') return 'Nueva solicitud de compra';
    if (n.type.startsWith('PROVIDER_')) return 'Actualización de proveedor';
    if (n.type.startsWith('INCIDENT_')) return 'Incidencia';
    if (n.type.startsWith('WHOLESALE_ACCESS_')) return 'Acceso a mayoreo';
    if (n.type.startsWith('COMMISSION_')) return 'Comisiones';
    if (n.type.startsWith('PAYMENT_')) return 'Pagos';
    return n.groupId ? 'Grupo' : 'Aviso de Partly';
  }
  if (n.payload.startsWith('Partly definió la comisión')) return 'Partly definió tu comisión';
  if (n.payload.startsWith('El equipo de Partly solicita las credenciales')) return 'Partly te pide las credenciales';
  if (n.type === 'GROUP_READY_TO_START') return 'Tu grupo ya puede iniciar';
  if (n.type === 'GROUP_FULL') return '¡Tu grupo se llenó!';
  if (n.type === 'GROUP_START_REMINDER') return 'Tus compradores te esperan';
  const payload = n.payload.toLowerCase();
  if (payload.includes('correo') && payload.includes('contrase')) return 'Nos falta el correo y la contraseña';
  if (payload.includes('revisión') || payload.includes('revision')) return 'Tu grupo está en revisión';
  if (payload.includes('aprobado') || payload.includes('disponible')) return 'Tu grupo ya está disponible';
  switch (n.type) {
    case 'INCIDENT_MESSAGE': return 'Nuevo mensaje de soporte';
    case 'CREDENTIAL_UPDATED': return 'Credenciales actualizadas';
    case 'PAYMENT_DUE_SOON': return 'Tu pago está próximo';
    case 'PAYMENT_FAILED': return 'No pudimos procesar tu pago';
    case 'PAYMENT_CONFIRMED': return 'Pago confirmado';
    case 'PAYMENT_RECEIPT_UPLOADED': return 'Nuevo comprobante de pago';
    case 'PAYMENT_RECEIPT_REJECTED': return 'Comprobante rechazado';
    case 'PAYOUT_PAID': return 'Retiro procesado';
    case 'PROVIDER_ORDER_RECEIPT_REJECTED': return 'Comprobante rechazado';
    case 'PROVIDER_ORDER_EXPIRING': return 'Tu cuenta de mayoreo vence pronto';
    case 'PROVIDER_ORDER_EXPIRED': return 'Tu cuenta de mayoreo venció';
    case 'PROVIDER_ORDER_CANCELLED': return 'Compra al mayoreo cancelada';
    case 'WHOLESALE_ACCESS_APPROVED': return 'Acceso al mayoreo aprobado';
    case 'WHOLESALE_ACCESS_REJECTED': return 'Acceso al mayoreo';
    case 'COMMISSION_DUE': return 'Comisión por pagar';
    case 'COMMISSION_REMINDER': return 'Tu comisión vence pronto';
    case 'COMMISSION_OVERDUE': return 'Comisión vencida';
    case 'COMMISSION_PAID': return 'Comisión pagada';
    case 'COMMISSION_REJECTED': return 'Comprobante de comisión rechazado';
    case 'COMMISSION_RECEIPT_UPLOADED': return 'Comisión por revisar';
    case 'MEMBERSHIP_CANCELLED': return 'Membresía cancelada';
    case 'PROVIDER_ORDER_APPROVED': return 'Tu compra fue aprobada';
    case 'PROVIDER_ORDER_REJECTED': return 'Tu compra fue rechazada';
  }
  if (n.type.startsWith('PROVIDER_')) return 'Actualización de proveedor';
  if (n.type.startsWith('INCIDENT_')) return 'Actualización de incidencia';
  return 'Aviso de Partly';
}

/** Color del ícono: amber = requiere atención, red = algo salió mal, blue = buena noticia del grupo, green = normal. */
export function notificationTone(n: Notification): 'green' | 'amber' | 'blue' | 'red' | 'slate' {
  if (n.type === 'GROUP_START_REMINDER') return 'amber';
  if (n.type === 'GROUP_READY_TO_START' || n.type === 'GROUP_FULL') return 'green';
  const payload = n.payload.toLowerCase();
  if (payload.includes('revisión') || payload.includes('revision')) return 'amber';
  if (payload.includes('aprobado') || payload.includes('disponible') || n.type === 'PAYMENT_CONFIRMED') return 'blue';
  if (['COMMISSION_OVERDUE', 'COMMISSION_REMINDER', 'COMMISSION_DUE', 'PROVIDER_ORDER_EXPIRING', 'PROVIDER_ORDER_EXPIRED'].includes(n.type)) return 'amber';
  if (n.type.includes('FAILED') || n.type.includes('REJECTED') || n.type.startsWith('INCIDENT_')) return 'red';
  return 'green';
}

export function notificationCategory(n: Notification): NotificationCategory {
  if (n.type.startsWith('PAYMENT_') || n.type.startsWith('COMMISSION_') || n.type === 'PAYOUT_PAID') return 'payments';
  if (n.type.startsWith('PROVIDER_') || n.type.startsWith('WHOLESALE_ACCESS_')) return 'wholesale';
  if (n.type.startsWith('INCIDENT_')) return 'support';
  if (n.groupId || isGroupStartNotice(n.type) || n.type === 'MEMBERSHIP_CANCELLED' || n.type === 'CREDENTIAL_UPDATED') return 'groups';
  return 'system';
}

/** A dónde lleva la notificación y cómo se llama ese botón; null si es solo informativa. */
export function notificationTarget(n: Notification, area: NotificationArea): NotificationTarget | null {
  if (area === 'admin') {
    if (n.type.startsWith('WHOLESALE_ACCESS_')) return { commands: ['/admin/mayoreo-acceso'], label: 'Ver solicitudes de mayoreo' };
    if (n.type.startsWith('PROVIDER_')) return { commands: ['/admin/mi-tienda'], label: 'Ir a Mi tienda' };
    if (n.type.startsWith('INCIDENT_')) return { commands: ['/admin/incidencias'], label: 'Ver incidencias' };
    if (n.type.startsWith('COMMISSION_')) return { commands: ['/admin/comisiones'], label: 'Ir a Comisiones' };
    if (n.groupId) return { commands: ['/admin/grupos', n.groupId], label: 'Revisar el grupo' };
    return null;
  }
  if (n.type.startsWith('COMMISSION_')) return { commands: ['/panel/comisiones'], label: 'Ir a Comisiones' };
  if (n.type.startsWith('PROVIDER_ORDER_') || n.type.startsWith('WHOLESALE_ACCESS_')) return { commands: ['/panel/mayoreo'], label: 'Ir a Mayoreo' };
  if (n.groupId && isGroupStartNotice(n.type)) return { commands: ['/panel/grupos', n.groupId, 'iniciar'], label: 'Iniciar mi grupo' };
  if (n.groupId && (n.type === 'PAYMENT_DUE_SOON' || n.type === 'PAYMENT_RECEIPT_REJECTED')) return { commands: ['/panel/grupos', n.groupId, 'pago'], label: 'Ir a pagar' };
  if (n.groupId) return { commands: ['/panel/grupos', n.groupId], label: 'Ver el grupo' };
  if (n.type.startsWith('INCIDENT_')) return { commands: ['/panel/soporte'], label: 'Ver soporte' };
  return null;
}
