import { Role } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
}

export interface EmailVerificationPayload {
  sub: string;
  purpose: 'email-verification';
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  name: string;
}

export interface GoogleProfilePayload {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface RequestMeta {
  userAgent?: string;
  ip?: string;
}
