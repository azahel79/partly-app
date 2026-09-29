/** Cómo reciben el acceso los miembros de un grupo. */
export type GroupAccessType = 'CREDENTIALS' | 'INVITE_LINK';

/**
 * Plataformas en las que el acceso se puede dar con una invitación al grupo familiar en lugar de correo y contraseña
 * (igual que en el servidor). Se reconoce por el nombre: "YouTube Premium", "Spotify Familiar", "Canva Pro"…
 */
export function supportsInviteLink(platformName: string | null | undefined): boolean {
  return /youtube|spotify|canva/i.test(platformName ?? '');
}
