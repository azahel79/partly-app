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
