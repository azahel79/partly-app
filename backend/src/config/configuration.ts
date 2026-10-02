export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  frontendUrl: process.env.FRONTEND_URL,
  trustProxy: parseInt(process.env.TRUST_PROXY ?? '0', 10),
  swaggerEnabled: process.env.SWAGGER_ENABLED
    ? process.env.SWAGGER_ENABLED === 'true'
    : process.env.NODE_ENV !== 'production',
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },
  passwordReset: {
    expiresIn: process.env.PASSWORD_RESET_EXPIRES_IN ?? '30m',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL,
  },
  credentialsEncryptionKey: process.env.CREDENTIALS_ENCRYPTION_KEY,
  receipts: {
    dir: process.env.RECEIPTS_DIR ?? 'uploads/receipts',
    retentionDays: parseInt(process.env.RECEIPTS_RETENTION_DAYS ?? '30', 10),
  },
  // Correo saliente. Con MAIL_PROVIDER=log (por defecto) nada sale de verdad: los correos quedan
  // guardados en la bandeja de salida y el admin los ve en modo simulado. Para activar el envío
  // real basta cambiar el proveedor y llenar sus variables (ver .env.example).
  mail: {
    provider: (process.env.MAIL_PROVIDER ?? 'log').toLowerCase(),
    fromName: process.env.MAIL_FROM_NAME || 'Tequio',
    fromAddress: process.env.MAIL_FROM_ADDRESS || undefined,
    replyTo: process.env.MAIL_REPLY_TO || undefined,
    resendApiKey: process.env.RESEND_API_KEY || undefined,
    resendApiUrl: process.env.RESEND_API_URL || 'https://api.resend.com/emails',
    brevoApiKey: process.env.BREVO_API_KEY || undefined,
    brevoApiUrl: process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email',
    smtpHost: process.env.SMTP_HOST || undefined,
    smtpPort: parseInt(process.env.SMTP_PORT ?? '587', 10),
    smtpSecure: process.env.SMTP_SECURE === 'true',
    smtpUser: process.env.SMTP_USER || undefined,
    smtpPass: process.env.SMTP_PASS || undefined,
  },
});
