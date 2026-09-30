import { NotificationType, Role } from '@prisma/client';
import { emailForNotification } from '../src/modules/notifications/email-rules';

const user = { role: Role.USER, emailNotifications: true, deletedAt: null };
const admin = { role: Role.ADMIN, emailNotifications: true, deletedAt: null };

describe('Qué avisos salen también por correo', () => {
  it('un aviso general sale con su propio asunto y el botón a su grupo', () => {
    const email = emailForNotification({ type: NotificationType.SYSTEM, groupId: 'g1' }, user, '¡Tu grupo fue aprobado!');
    expect(email?.title).toBe('¡Tu grupo fue aprobado!');
    expect(email?.cta?.path).toBe('/panel/grupos/g1');
  });

  it('a un admin también le llega, con el botón a su panel', () => {
    const email = emailForNotification({ type: NotificationType.SYSTEM, groupId: 'g1' }, admin, 'Nuevo grupo por revisar');
    expect(email?.title).toBe('Nuevo grupo por revisar');
    expect(email?.cta?.path).toBe('/admin/grupos/g1');
  });

  it('sin asunto propio usa el de la regla', () => {
    expect(emailForNotification({ type: NotificationType.RENEWAL_CONFIRMED, groupId: 'g1' }, user)?.title).toBe('Tu renovación quedó confirmada');
  });

  it('un aviso para compradores y vendedores no le llega a un admin, ni al revés', () => {
    expect(emailForNotification({ type: NotificationType.PAYMENT_DUE_SOON }, admin)).toBeNull();
    expect(emailForNotification({ type: NotificationType.COMMISSION_RECEIPT_UPLOADED }, user)).toBeNull();
  });

  it('respeta a quien apagó los correos', () => {
    expect(emailForNotification({ type: NotificationType.MEMBER_LEFT }, { ...user, emailNotifications: false })).toBeNull();
  });

  it('los recordatorios esperan a la mañana; lo urgente no', () => {
    expect(emailForNotification({ type: NotificationType.PAYMENT_DUE_SOON }, user)?.defer).toBe(true);
    expect(emailForNotification({ type: NotificationType.RENEWAL_CONFIRMED }, user)?.defer).toBe(false);
  });

  it('lo informativo o la confirmación de algo que la persona acaba de hacer se queda en la app', () => {
    for (const type of [NotificationType.SEAT_RESERVED, NotificationType.COMMISSION_PAID, NotificationType.COMMISSION_RATE_APPROVED, NotificationType.WHOLESALE_ACCESS_APPROVED, NotificationType.PROVIDER_ORDER_APPROVED]) {
      expect(emailForNotification({ type }, user)).toBeNull();
    }
  });
});
