/** Por qué alguien dejó el grupo (define el texto del aviso al vendedor). */
export type MemberLeftReason = 'unpaid' | 'not_renewed' | 'left';

/**
 * Aviso al vendedor cuando alguien deja su grupo. Si esa persona ya había pagado, vio la contraseña de la
 * cuenta: Partly le oculta las credenciales, pero la única forma real de cortarle el acceso es que el
 * vendedor cambie la contraseña en la plataforma. Por eso el aviso se lo pide en ese mismo momento.
 */
export function memberLeftNotice(params: { memberName: string; platform: string; reason: MemberLeftReason; hadAccess: boolean }): string {
  const { memberName, platform, reason, hadAccess } = params;
  const what =
    reason === 'unpaid'
      ? hadAccess
        ? `${memberName} no pagó su renovación a tiempo y ya no pertenece a tu grupo de ${platform}.`
        : `${memberName} no pagó a tiempo el lugar que había apartado en tu grupo de ${platform}; ese lugar ya quedó libre.`
      : reason === 'not_renewed'
        ? `${memberName} terminó su periodo y no renovó; su lugar en tu grupo de ${platform} quedó libre.`
        : `${memberName} salió de tu grupo de ${platform} y su lugar quedó libre.`;
  if (!hadAccess) return what;
  return (
    `${what} Por seguridad, cambia la contraseña de la cuenta, cierra sesión en todos los dispositivos y actualízala en Partly ` +
    `para que tus miembros sigan entrando. Si su perfil dentro de ${platform} tenía su nombre, bórralo o renómbralo antes de dárselo a alguien más.`
  );
}
