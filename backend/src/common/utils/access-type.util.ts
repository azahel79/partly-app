/**
 * Plataformas en las que el acceso se puede dar con una invitación al grupo familiar en lugar de correo y contraseña.
 * Se reconoce por el nombre, así que también cubre "YouTube Premium", "Spotify Familiar", "Canva Pro", etc.
 */
const INVITE_PLATFORMS = /youtube|spotify|canva/i;

export function supportsInviteLink(platformName: string): boolean {
  return INVITE_PLATFORMS.test(platformName);
}
