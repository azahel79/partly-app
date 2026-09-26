import { validationSchema } from '../src/config/validation.schema';

const validBase = {
  NODE_ENV: 'production',
  PORT: 3000,
  FRONTEND_URL: 'https://vakeva.example.com',
  DATABASE_URL: 'postgresql://user:password@database:5432/vakeva',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_CALLBACK_URL: 'https://vakeva.example.com/api/auth/google/callback',
  CREDENTIALS_ENCRYPTION_KEY: 'c'.repeat(64),
  MAIL_PROVIDER: 'resend',
  MAIL_FROM_ADDRESS: 'no-reply@vakeva.example.com',
  RESEND_API_KEY: 'resend-key',
};

describe('validation.schema', () => {
  it('acepta una configuración de producción completa', () => {
    expect(validationSchema.validate(validBase).error).toBeUndefined();
  });

  it('exige HTTPS en los orígenes públicos de producción', () => {
    const result = validationSchema.validate({ ...validBase, FRONTEND_URL: 'http://vakeva.example.com' });
    expect(result.error?.message).toContain('FRONTEND_URL');
  });

  it('rechaza el transporte de correo simulado en producción', () => {
    const result = validationSchema.validate({ ...validBase, MAIL_PROVIDER: 'log' });
    expect(result.error?.message).toContain('MAIL_PROVIDER');
  });

  it('exige secretos JWT de al menos 32 caracteres en producción', () => {
    const result = validationSchema.validate({ ...validBase, JWT_ACCESS_SECRET: 'short-secret-123' });
    expect(result.error?.message).toContain('JWT_ACCESS_SECRET');
  });
});
