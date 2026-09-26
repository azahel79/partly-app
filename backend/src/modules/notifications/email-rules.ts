import { NotificationType, Role } from '@prisma/client';

export interface EmailCta {
  label: string;
  /** Ruta dentro de la app (se antepone la URL pública). */
  path: string;
}

export interface EmailRule {
  /** Asunto y título del correo. */
  title: string;
  /** A quién le llega: solo usuarios, solo admins, o cualquiera. */
  audience: 'user' | 'admin' | 'any';
  /** true = no se manda de madrugada; espera a la mañana. */
  defer?: boolean;
  cta?: (notification: { groupId?: string }, role: Role) => EmailCta | null;
}

const groupPay = (n: { groupId?: string }): EmailCta =>
  n.groupId ? { label: 'Pagar ahora', path: `/panel/grupos/${n.groupId}/pago` } : { label: 'Ver mis grupos', path: '/panel/grupos' };
const groupDetail = (n: { groupId?: string }): EmailCta =>
  n.groupId ? { label: 'Ver el grupo', path: `/panel/grupos/${n.groupId}` } : { label: 'Ver mis grupos', path: '/panel/grupos' };
const startGroup = (n: { groupId?: string }): EmailCta =>
  n.groupId ? { label: 'Iniciar mi grupo', path: `/panel/grupos/${n.groupId}/iniciar` } : { label: 'Ver mis grupos', path: '/panel/grupos' };
const commissions = (): EmailCta => ({ label: 'Ir a Comisiones', path: '/panel/comisiones' });
const wholesale = (): EmailCta => ({ label: 'Ir a Mayoreo', path: '/panel/mayoreo' });

/**
 * Qué notificaciones de la app también salen por correo, con qué título y a dónde lleva el botón.
 * Lo que no está aquí (incidencias y estado del perfil de proveedor ya mandan su propio correo;
 * los avisos de baja frecuencia solo se ven en la app) no genera correo.
 */
export const EMAIL_RULES: Partial<Record<NotificationType, EmailRule>> = {
  // pagos del comprador
  PAYMENT_DUE_SOON: { title: 'Tu pago está por vencer', audience: 'user', defer: true, cta: groupPay },
  PAYMENT_FAILED: { title: 'No pudimos procesar tu pago', audience: 'user', cta: groupPay },
  PAYMENT_CONFIRMED: { title: 'Pago confirmado', audience: 'user', cta: groupDetail },
  PAYMENT_RECEIPT_REJECTED: { title: 'Tu comprobante fue rechazado', audience: 'user', cta: groupPay },
  MEMBERSHIP_CANCELLED: { title: 'Tu membresía fue cancelada', audience: 'user', cta: () => ({ label: 'Explorar grupos', path: '/panel/explorar' }) },
  CREDENTIAL_UPDATED: { title: 'Cambiaron las credenciales de tu cuenta', audience: 'user', cta: groupDetail },
  // el vendedor con comprobantes por revisar
  PAYMENT_RECEIPT_UPLOADED: { title: 'Tienes un comprobante por revisar', audience: 'user', cta: (n) => ({ label: 'Revisar comprobantes', path: n.groupId ? `/panel/grupos/${n.groupId}` : '/panel/grupos' }) },
  // el vendedor con un grupo que ya puede iniciar
  GROUP_READY_TO_START: { title: 'Tu grupo ya puede iniciar', audience: 'user', cta: startGroup },
  GROUP_FULL: { title: 'Tu grupo se llenó', audience: 'user', cta: startGroup },
  GROUP_START_REMINDER: { title: 'Tus compradores esperan que inicies el grupo', audience: 'user', defer: true, cta: startGroup },
  // comisión de Partly
  COMMISSION_DUE: { title: 'Tienes una comisión por pagar', audience: 'user', defer: true, cta: commissions },
  COMMISSION_REMINDER: { title: 'Tu comisión vence pronto', audience: 'user', defer: true, cta: commissions },
  COMMISSION_OVERDUE: { title: 'Tu comisión está vencida', audience: 'user', cta: commissions },
  COMMISSION_REJECTED: { title: 'Rechazamos tu comprobante de comisión', audience: 'user', cta: commissions },
  COMMISSION_PAID: { title: 'Recibimos tu pago de comisión', audience: 'user', cta: commissions },
  COMMISSION_RECEIPT_UPLOADED: { title: 'Comprobante de comisión por revisar', audience: 'admin', cta: () => ({ label: 'Revisar comisiones', path: '/admin/comisiones' }) },
  // mayoreo
  PROVIDER_ORDER_APPROVED: { title: 'Tu compra al mayoreo avanzó', audience: 'user', cta: wholesale },
  PROVIDER_ORDER_DELIVERED: { title: 'Tu cuenta de mayoreo está lista', audience: 'user', cta: wholesale },
  PROVIDER_ORDER_REJECTED: { title: 'Tu solicitud de mayoreo fue rechazada', audience: 'user', cta: wholesale },
  PROVIDER_ORDER_RECEIPT_REJECTED: { title: 'Rechazaron tu comprobante de mayoreo', audience: 'user', cta: wholesale },
  PROVIDER_ORDER_CANCELLED: { title: 'Tu compra al mayoreo fue cancelada', audience: 'user', cta: wholesale },
  PROVIDER_ORDER_EXPIRING: { title: 'Tu cuenta de mayoreo vence pronto', audience: 'user', defer: true, cta: wholesale },
  PROVIDER_ORDER_EXPIRED: { title: 'Tu cuenta de mayoreo venció', audience: 'user', cta: wholesale },
  PROVIDER_ORDER_RECEIPT_UPLOADED: { title: 'Comprobante de mayoreo por validar', audience: 'admin', cta: () => ({ label: 'Ver pedidos', path: '/admin/mi-tienda' }) },
  WHOLESALE_ACCESS_APPROVED: { title: 'Ya puedes comprar al mayoreo', audience: 'user', cta: wholesale },
  WHOLESALE_ACCESS_REJECTED: { title: 'Sobre tu acceso al mayoreo', audience: 'user', cta: wholesale },
  WHOLESALE_ACCESS_REQUESTED: { title: 'Nueva solicitud de acceso al mayoreo', audience: 'admin', cta: () => ({ label: 'Revisar solicitudes', path: '/admin/mayoreo-acceso' }) },
  // avisos generales (aprobación de grupos, credenciales, etc.)
  SYSTEM: { title: 'Aviso de Partly', audience: 'user', cta: (n) => (n.groupId ? { label: 'Ver el grupo', path: `/panel/grupos/${n.groupId}` } : null) },
};
