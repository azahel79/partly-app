export interface Credential {
  username: string;
  password: string;
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
  username: string;
  password: string;
  notes?: string;
  changeReason?: string;
}
