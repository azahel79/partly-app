import { GroupAccessType, Prisma } from '@prisma/client';

/** Por qué alguien dejó el grupo (define el texto del aviso al vendedor). */
export type MemberLeftReason = 'unpaid' | 'not_renewed' | 'left';

/**
 * Aviso al vendedor cuando alguien deja su grupo. Si esa persona ya había pagado, vio la contraseña de la
 * cuenta: Partly le oculta las credenciales, pero la única forma real de cortarle el acceso es que el
 * vendedor cambie la contraseña en la plataforma. Por eso el aviso se lo pide en ese mismo momento.
 */
export function memberLeftNotice(params: { memberName: string; platform: string; reason: MemberLeftReason; hadAccess: boolean; wholesale?: boolean; invite?: boolean }): string {
  const { memberName, platform, reason, hadAccess, wholesale, invite } = params;
  const what =
    reason === 'unpaid'
      ? hadAccess
        ? `${memberName} no pagó su renovación a tiempo y ya no pertenece a tu grupo de ${platform}.`
        : `${memberName} no pagó a tiempo el lugar que había apartado en tu grupo de ${platform}; ese lugar ya quedó libre.`
      : reason === 'not_renewed'
        ? `${memberName} terminó su periodo y no renovó; su lugar en tu grupo de ${platform} quedó libre.`
        : `${memberName} salió de tu grupo de ${platform} y su lugar quedó libre.`;
  if (!hadAccess) return what;
  if (invite) {
    // Acceso por invitación: no hay contraseña que cambiar, hay que sacarlo del grupo familiar.
    return `${what} Sácalo del grupo familiar en ${platform} para que deje de tener acceso y confírmalo en tu grupo de Partly.`;
  }
  if (wholesale) {
    // Cuenta de mayoreo: la contraseña la administra Partly, que ya recibió el aviso para cambiarla.
    return `${what} Como es una cuenta de mayoreo, Partly cambiará la contraseña y te avisaremos cuando la actualice (tus miembros también reciben el aviso).`;
  }
  return (
    `${what} Por seguridad, cambia la contraseña de la cuenta, cierra sesión en todos los dispositivos y actualízala en Partly ` +
    `para que tus miembros sigan entrando. Si su perfil dentro de ${platform} tenía su nombre, bórralo o renómbralo antes de dárselo a alguien más.`
  );
}

/** Aviso para Partly: salió alguien con acceso de un grupo que usa una de sus cuentas de mayoreo. */
export function wholesaleRotationNotice(params: { memberName: string; platform: string; sellerName: string }): string {
  return `${params.memberName} salió del grupo de ${params.platform} de ${params.sellerName} (cuenta de mayoreo). Cambia la contraseña de esa cuenta y actualízala en Mi tienda: el grupo y sus miembros se actualizan solos.`;
}

/**
 * Cómo se corta el acceso de quien sale: con una invitación (sacarlo del grupo familiar) o, en una cuenta de mayoreo
 * que Partly entregó con credenciales, Partly cambia la contraseña (el vendedor no puede).
 */
export async function memberLeftContext(client: Pick<Prisma.TransactionClient, 'group'>, groupId: string): Promise<{ invite: boolean; wholesale: boolean; sellerName: string }> {
  const group = await client.group.findUniqueOrThrow({
    where: { id: groupId },
    select: { accessType: true, owner: { select: { name: true } }, sourceProviderOrder: { select: { credential: { select: { panelUrlEncrypted: true } } } } },
  });
  const delivered = group.sourceProviderOrder?.credential;
  return { invite: group.accessType === GroupAccessType.INVITE_LINK, wholesale: !!delivered && !delivered.panelUrlEncrypted, sellerName: group.owner.name };
}
