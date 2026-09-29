export interface Credential {
  /** Correo y contraseña, o link de invitación al grupo familiar (YouTube, Spotify y Canva). */
  accessType: 'CREDENTIALS' | 'INVITE_LINK';
  username: string | null;
  password: string | null;
  inviteLink: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface CredentialHistoryEntry {
  id: string;
  changedBy: { id: string; name: string };
  changedAt: string;
  changeReason: string | null;
}

export interface UpsertCredentialInput {
  username?: string;
  password?: string;
  /** Grupos con acceso por invitación. */
  inviteLink?: string;
  notes?: string;
  changeReason?: string;
}
