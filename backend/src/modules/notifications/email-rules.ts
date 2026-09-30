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
 * El correo es para lo concreto, no para todo: sale cuando la persona TIENE QUE HACER algo (pagar, subir otro
 * comprobante, revisar uno, cambiar la contraseña, iniciar el grupo, renovar la cuenta) o cuando CAMBIÓ SU ACCESO O
 * SU DINERO (entró, renovó, perdió su lugar, cambió la contraseña, se entregó o venció su cuenta). Lo informativo
 * o la confirmación de algo que la persona acaba de hacer se queda en la app: no está aquí, o se crea con
 * `email: false`. Las incidencias mandan su propio correo (solo cuando hay que responder).
 */
export const EMAIL_RULES: Partial<Record<NotificationType, EmailRule>> = {
  // pagos del comprador
  PAYMENT_DUE_SOON: { title: 'Tu pago está por vencer', audience: 'user', defer: true, cta: groupPay },
  PAYMENT_FAILED: { title: 'No pudimos procesar tu pago', audience: 'user', cta: groupPay },
  PAYMENT_CONFIRMED: { title: 'Pago confirmado', audience: 'user', cta: groupDetail },
  MEMBERSHIP_ACTIVATED: { title: '¡Ya estás dentro del grupo!', audience: 'user', cta: (n) => ({ label: 'Ver mis credenciales', path: n.groupId ? `/panel/grupos/${n.groupId}` : '/panel/grupos' }) },
  RENEWAL_CONFIRMED: { title: 'Tu renovación quedó confirmada', audience: 'user', cta: groupDetail },
  PAYMENT_RECEIPT_REJECTED: { title: 'Tu comprobante fue rechazado', audience: 'user', cta: groupPay },
  MEMBERSHIP_CANCELLED: { title: 'Tu membresía fue cancelada', audience: 'user', cta: () => ({ label: 'Explorar grupos', path: '/panel/explorar' }) },
  CREDENTIAL_UPDATED: { title: 'Cambiaron las credenciales de tu cuenta', audience: 'user', cta: groupDetail },
  // el vendedor: salió alguien que ya conocía la contraseña
  MEMBER_LEFT: { title: 'Alguien salió de tu grupo: cambia la contraseña', audience: 'user', cta: (n) => ({ label: 'Actualizar credenciales', path: n.groupId ? `/panel/grupos/${n.groupId}` : '/panel/grupos' }) },
  // el vendedor con comprobantes por revisar
  PAYMENT_RECEIPT_UPLOADED: { title: 'Tienes un comprobante por revisar', audience: 'user', cta: (n) => ({ label: 'Revisar comprobantes', path: n.groupId ? `/panel/grupos/${n.groupId}` : '/panel/grupos' }) },
  // el vendedor con un grupo que ya puede iniciar
  GROUP_READY_TO_START: { title: 'Tu grupo ya puede iniciar', audience: 'user', cta: startGroup },
  // Solo cuando se llena de golpe (primer aviso para iniciar); si ya estaba listo, se crea con `email: false`.
  GROUP_FULL: { title: 'Tu grupo se llenó: ya puedes iniciarlo', audience: 'user', cta: startGroup },
  GROUP_START_REMINDER: { title: 'Tus compradores esperan que inicies el grupo', audience: 'user', defer: true, cta: startGroup },
  // comisión de Partly
  COMMISSION_DUE: { title: 'Tienes una comisión por pagar', audience: 'user', defer: true, cta: commissions },
  COMMISSION_REMINDER: { title: 'Tu comisión vence pronto', audience: 'user', defer: true, cta: commissions },
  COMMISSION_OVERDUE: { title: 'Tu comisión está vencida', audience: 'user', cta: commissions },
  COMMISSION_REJECTED: { title: 'Rechazamos tu comprobante de comisión', audience: 'user', cta: commissions },
  COMMISSION_RECEIPT_UPLOADED: { title: 'Comprobante de comisión por revisar', audience: 'admin', cta: () => ({ label: 'Revisar comisiones', path: '/admin/comisiones' }) },
  COMMISSION_RATE_REQUESTED: { title: 'Nueva solicitud de comisión reducida', audience: 'admin', cta: () => ({ label: 'Revisar solicitudes', path: '/admin/comisiones' }) },
  // mayoreo
  PROVIDER_ORDER_DELIVERED: { title: 'Tu cuenta de mayoreo está lista', audience: 'user', cta: wholesale },
  PROVIDER_ORDER_REJECTED: { title: 'Tu solicitud de mayoreo fue rechazada', audience: 'user', cta: wholesale },
  PROVIDER_ORDER_RECEIPT_REJECTED: { title: 'Rechazaron tu comprobante de mayoreo', audience: 'user', cta: wholesale },
  PROVIDER_ORDER_CANCELLED: { title: 'Tu compra al mayoreo fue cancelada', audience: 'user', cta: wholesale },
  PROVIDER_ORDER_EXPIRING: { title: 'Tu cuenta de mayoreo vence pronto', audience: 'user', defer: true, cta: wholesale },
  PROVIDER_ORDER_EXPIRED: { title: 'Tu cuenta de mayoreo venció', audience: 'user', cta: wholesale },
  PROVIDER_ORDER_RECEIPT_UPLOADED: { title: 'Comprobante de mayoreo por validar', audience: 'admin', cta: () => ({ label: 'Ver pedidos', path: '/admin/mi-tienda' }) },
  WHOLESALE_ACCESS_REQUESTED: { title: 'Nueva solicitud de acceso al mayoreo', audience: 'admin', cta: () => ({ label: 'Revisar solicitudes', path: '/admin/mayoreo-acceso' }) },
  // avisos generales (aprobación de grupos, credenciales, etc.): cada uno trae su propio asunto. También les llegan
  // a los admins (grupo por revisar, credenciales enviadas, contraseña de mayoreo por cambiar).
  SYSTEM: {
    title: 'Aviso de Partly',
    audience: 'any',
    cta: (n, role) => (n.groupId ? { label: 'Ver el grupo', path: role === Role.ADMIN ? `/admin/grupos/${n.groupId}` : `/panel/grupos/${n.groupId}` } : null),
  },
};

/**
 * Decide si un aviso también sale por correo y cómo: respeta el interruptor de correos de la persona, a quién va
 * dirigida la regla (usuario o admin) y el asunto propio del aviso, si trae uno. `null` = solo en la app.
 */
export function emailForNotification(
  notification: { type: NotificationType; groupId?: string },
  recipient: { role: Role; emailNotifications: boolean; deletedAt: Date | null },
  subject?: string,
): { title: string; defer: boolean; cta: EmailCta | null } | null {
  const rule = EMAIL_RULES[notification.type];
  if (!rule || !recipient.emailNotifications || recipient.deletedAt) return null;
  const isAdmin = recipient.role === Role.ADMIN;
  if ((rule.audience === 'user' && isAdmin) || (rule.audience === 'admin' && !isAdmin)) return null;
  return { title: subject ?? rule.title, defer: !!rule.defer, cta: rule.cta?.(notification, recipient.role) ?? null };
}

