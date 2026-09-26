import { createHash, randomBytes } from 'crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateOpaqueToken(): string {
  return randomBytes(48).toString('hex');
}
