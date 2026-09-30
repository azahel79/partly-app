import { BillingPeriod } from '@prisma/client';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const BILLING_PERIOD_MONTHS: Record<BillingPeriod, number> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

/** Fecha del mes (año/mes dados), recortada al último día si el mes es más corto (ej. día 31 en febrero). */
function clampToMonth(year: number, month: number, day: number): Date {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, daysInMonth)));
}

/**
 * Próxima ocurrencia futura de "el día `billingDay` del mes" a partir de `from`.
 * Es solo la PRIMERA fecha de corte; los cobros siguientes recurren según el
 * billingPeriod del plan (mensual/trimestral/etc.), no este cálculo.
 */
export function nextOccurrenceOfDay(billingDay: number, from: Date = new Date()): Date {
  const candidate = clampToMonth(from.getUTCFullYear(), from.getUTCMonth(), billingDay);
  if (candidate.getTime() > from.getTime()) {
    return candidate;
  }
  return clampToMonth(from.getUTCFullYear(), from.getUTCMonth() + 1, billingDay);
}

/** "al mes", "cada 2 meses", "al año": para los textos de avisos y correos según lo que dura el periodo. */
export function perPeriodLabel(billingPeriod: BillingPeriod): string {
  const months = BILLING_PERIOD_MONTHS[billingPeriod] ?? 1;
  return months === 1 ? 'al mes' : months === 12 ? 'al año' : `cada ${months} meses`;
}

/** Avanza `from` los meses que corresponden a un `billingPeriod` (1/2/3/6/12), respetando el día del mes. */
export function addBillingPeriod(from: Date, billingPeriod: BillingPeriod): Date {
  const months = BILLING_PERIOD_MONTHS[billingPeriod];
  return clampToMonth(from.getUTCFullYear(), from.getUTCMonth() + months, from.getUTCDate());
}

/** Días completos entre dos fechas (redondeado hacia arriba; nunca negativo). */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY));
}

/**
 * Precio prorrateado por los días que realmente restan de un periodo. Si el periodo ya
 * terminó o restan 0 días, regresa 0; si por alguna razón el periodo total es 0 días,
 * regresa el precio completo (evita dividir entre cero).
 */
export function proratedAmount(fullPrice: number, periodStart: Date, periodEnd: Date, from: Date = new Date()): number {
  const totalDays = daysBetween(periodStart, periodEnd);
  const remainingDays = daysBetween(from, periodEnd);
  if (totalDays === 0) {
    return fullPrice;
  }
  const amount = (fullPrice * remainingDays) / totalDays;
  return Math.round(amount * 100) / 100;
}

/**
 * Mínimo de días que le deben quedar al ciclo en curso para poder entrar a un grupo ya iniciado. Así quien
 * entra paga solo los días que faltan, sin obligarlo a pagar también el mes siguiente, y al vendedor no le
 * entran cobros de unos cuantos pesos. En planes mensuales son 15 días; en los demás, la mitad del ciclo.
 * Con menos que esto se espera a que el grupo renueve y empiece su ciclo nuevo.
 */
export function minEntryDays(billingPeriod: BillingPeriod): number {
  return billingPeriod === BillingPeriod.MONTHLY ? 15 : Math.round((BILLING_PERIOD_MONTHS[billingPeriod] * 30) / 2);
}

export interface JoinPricing {
  /** Precio completo del cupo por un ciclo. */
  fullPrice: number;
  /** Días del ciclo en curso y cuántos de ellos le quedan a quien entra hoy. */
  totalDays: number;
  remainingDays: number;
  /** Mínimo de días restantes para poder entrar hoy, y si hoy se puede. */
  minEntryDays: number;
  canJoinNow: boolean;
  /** true cuando entra a mitad de ciclo y paga solo una parte. */
  isProrated: boolean;
  /** Monto de los días restantes del ciclo en curso (pesos enteros, hacia arriba). */
  prorationAmount: number;
  /** Ya no se cobra el ciclo siguiente por adelantado; se conserva por los pagos que ya lo tenían. */
  includesNextCycle: boolean;
  /** Lo que paga hoy en total. */
  amountToPay: number;
  /** Desde cuándo y hasta cuándo queda cubierto con ese pago. */
  coveredFrom: Date;
  coveredUntil: Date;
  /** Fecha en que le toca renovar por primera vez (y en que abre el grupo si hoy no se puede entrar). */
  firstRenewalDate: Date;
}

/**
 * Cuánto paga quien entra a un grupo ya iniciado: precio × días restantes ÷ días del ciclo, redondeado
 * hacia arriba a pesos enteros y nunca por encima del precio completo. Solo se puede entrar si quedan al
 * menos `minEntryDays` días (o si entra el mismo día en que arrancó el ciclo).
 */
export function computeJoinPricing(
  fullPrice: number,
  cycleStart: Date,
  cycleEnd: Date,
  billingPeriod: BillingPeriod,
  now: Date = new Date(),
): JoinPricing {
  const totalDays = Math.max(1, daysBetween(cycleStart, cycleEnd));
  const remainingDays = Math.min(totalDays, daysBetween(now, cycleEnd));
  const minDays = Math.min(minEntryDays(billingPeriod), totalDays);

  // Entra el mismo día que arrancó el ciclo: paga el ciclo completo.
  const isProrated = remainingDays < totalDays && remainingDays > 0;
  const prorationAmount = isProrated
    ? Math.min(fullPrice, Math.ceil((fullPrice * remainingDays) / totalDays))
    : fullPrice;

  return {
    fullPrice,
    totalDays,
    remainingDays,
    minEntryDays: minDays,
    canJoinNow: remainingDays >= minDays,
    isProrated,
    prorationAmount,
    includesNextCycle: false,
    amountToPay: prorationAmount,
    coveredFrom: now,
    coveredUntil: cycleEnd,
    firstRenewalDate: cycleEnd,
  };
}
