/**
 * Reglas de la comisión de Partly (el vendedor la paga por transferencia, no se descuenta de
 * ningún saldo). Todo el calendario vive aquí para poder ajustarlo en un solo lugar.
 */

/** Si el grupo no se llena, la comisión ya es exigible esta cantidad de días después de que arranca el ciclo. */
export const COMMISSION_DUE_AFTER_DAYS = 7;

/** Días que tiene el vendedor, desde que se le cobra, para pagar antes de que sus grupos dejen de recibir miembros. */
export const COMMISSION_GRACE_DAYS = 7;

/** Cuántos días antes del límite se le recuerda en la app. */
export const COMMISSION_REMINDER_DAYS_BEFORE = 2;

export const DAY_MS = 24 * 60 * 60 * 1000;

export const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Comisión de Partly para todos los grupos, salvo que el vendedor tenga una reducida autorizada. */
export const DEFAULT_COMMISSION_PCT = 9;

/** Lo más bajo que puede autorizarse al rebajar la comisión de un vendedor. */
export const MIN_COMMISSION_PCT = 6;

/** Requisitos para pedir comisión reducida (reputación del vendedor). */
export const RATE_MIN_VALIDATED_PAYMENTS = 30;
export const RATE_MIN_RATING = 4.5;
export const RATE_MIN_REVIEWS = 5;
/** Sin comisiones vencidas en estos últimos días. */
export const RATE_CLEAN_DAYS = 90;
/** Tras un rechazo, cuántos días esperar para volver a pedirla. */
export const RATE_RETRY_DAYS = 30;
