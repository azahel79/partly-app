import * as Joi from 'joi';

export const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  FRONTEND_URL: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().uri({ scheme: ['https'] }).required(),
    otherwise: Joi.string().uri().required(),
  }),
  TRUST_PROXY: Joi.number().integer().min(0).default(0),
  SWAGGER_ENABLED: Joi.boolean(),

  DATABASE_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().min(16).required(),
  }),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().min(16).required(),
  }),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),

  PASSWORD_RESET_EXPIRES_IN: Joi.string().default('30m'),

  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().required(),
  GOOGLE_CALLBACK_URL: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().uri({ scheme: ['https'] }).required(),
    otherwise: Joi.string().uri().required(),
  }),

  CREDENTIALS_ENCRYPTION_KEY: Joi.string().hex().length(64).required(),

  RECEIPTS_DIR: Joi.string().default('uploads/receipts'),
  RECEIPTS_RETENTION_DAYS: Joi.number().default(30),

  // Correo saliente (todo opcional: sin configurar, los correos se simulan en la bandeja de salida).
  MAIL_PROVIDER: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('resend', 'brevo', 'smtp').insensitive().required(),
    otherwise: Joi.string().valid('log', 'resend', 'brevo', 'smtp').insensitive().default('log'),
  }),
  MAIL_FROM_NAME: Joi.string().allow('').default('Vakeva'),
  MAIL_FROM_ADDRESS: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().email().required(),
    otherwise: Joi.string().email().allow(''),
  }),
  MAIL_REPLY_TO: Joi.string().email().allow(''),
  RESEND_API_KEY: Joi.string().when('MAIL_PROVIDER', {
    is: 'resend',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow(''),
  }),
  RESEND_API_URL: Joi.string().uri().allow(''),
  BREVO_API_KEY: Joi.string().when('MAIL_PROVIDER', {
    is: 'brevo',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow(''),
  }),
  BREVO_API_URL: Joi.string().uri().allow(''),
  SMTP_HOST: Joi.string().when('MAIL_PROVIDER', {
    is: 'smtp',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow(''),
  }),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().when('MAIL_PROVIDER', {
    is: 'smtp',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow(''),
  }),
  SMTP_PASS: Joi.string().when('MAIL_PROVIDER', {
    is: 'smtp',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow(''),
  }),
});
