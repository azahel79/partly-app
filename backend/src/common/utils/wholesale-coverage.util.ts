import { BillingPeriod } from '@prisma/client';
import { addBillingPeriod } from './billing.util';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tolerancia entre la vigencia de la cuenta de mayoreo y el periodo del grupo: la cuenta dura 30 días y un mes del
 * grupo puede durar 28 a 31, así que no coinciden al día. Sin renovar, la cuenta vence cerca del corte; renovada o
 * repuesta, vence cerca del final del siguiente periodo.
 */
export const WHOLESALE_COVER_MARGIN_MS = 7 * DAY_MS;

/**
 * true si la cuenta del grupo sigue vigente (casi) todo el siguiente periodo, o si el grupo no viene del mayoreo.
 * Mientras sea false no se cobra la renovación a los miembros: pagarían un periodo de una cuenta que va a dejar de
 * funcionar a medio camino, y como el dinero va directo al vendedor, Partly no podría devolverlo.
 */
export function wholesaleCoversNextPeriod(expiresAt: Date | null | undefined, periodEnd: Date, billingPeriod: BillingPeriod): boolean {
  if (!expiresAt) return true;
  const nextPeriodEnd = addBillingPeriod(periodEnd, billingPeriod);
  return expiresAt.getTime() >= nextPeriodEnd.getTime() - WHOLESALE_COVER_MARGIN_MS;
}
