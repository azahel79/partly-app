/**
 * Reglas del mayoreo: cuánto tiempo hay para pagar, cuándo se avisa que una cuenta vence y
 * qué reputación se pide para poder comprar. Todo el calendario vive aquí para ajustarlo en un
 * solo lugar.
 */

/** Horas que tiene el comprador, desde que reserva la cuenta, para transferir y subir su comprobante. */
export const PAYMENT_WINDOW_HOURS = 48;

/** Si el admin rechaza el comprobante, el comprador recupera al menos este plazo para subir otro. */
export const RECEIPT_RETRY_WINDOW_HOURS = 24;

/** Desde cuántos días antes del vencimiento se puede renovar una cuenta o comprar su reposición. */
export const RENEWAL_WINDOW_DAYS = 7;

/** Avisos de vencimiento: etapa 1 a los 7 días, 2 a los 3, 3 al día siguiente, 4 ya vencida. */
export const EXPIRY_NOTICE_DAYS = [7, 3, 1] as const;

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

// ---- reputación para comprar al mayoreo
export const MIN_ACTIVE_GROUP_CYCLES = 2;
export const MIN_REVIEWS = 3;
export const MIN_RATING = 4.3;

/** Tope mensual sugerido al autorizar a un vendedor nuevo (el admin lo puede cambiar o quitar). */
export const SUGGESTED_MONTHLY_CAP = 2;
