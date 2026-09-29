/** Cada cuánto se cobra un grupo. Las duraciones que puede elegir el vendedor: 1, 2, 3, 6 o 12 meses. */
export type BillingPeriod = 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

export const BILLING_PERIOD_OPTIONS: { value: BillingPeriod; label: string; months: number }[] = [
  { value: 'MONTHLY', label: '1 mes', months: 1 },
  { value: 'BIMONTHLY', label: '2 meses', months: 2 },
  { value: 'QUARTERLY', label: '3 meses', months: 3 },
  { value: 'SEMIANNUAL', label: '6 meses', months: 6 },
  { value: 'ANNUAL', label: 'Anual', months: 12 },
];

const NOUN: Record<BillingPeriod, string> = { MONTHLY: 'mes', BIMONTHLY: '2 meses', QUARTERLY: '3 meses', SEMIANNUAL: '6 meses', ANNUAL: 'año' };
const ADJECTIVE: Record<BillingPeriod, string> = { MONTHLY: 'mensual', BIMONTHLY: 'bimestral', QUARTERLY: 'trimestral', SEMIANNUAL: 'semestral', ANNUAL: 'anual' };

/** "mes", "2 meses", "año": para "$60 / mes" o "por 3 meses". */
export function periodNoun(period: string): string {
  return NOUN[period as BillingPeriod] ?? 'mes';
}

/** "mensual", "bimestral", "anual". */
export function periodAdjective(period: string): string {
  return ADJECTIVE[period as BillingPeriod] ?? 'mensual';
}

/** "por mes", "cada 2 meses", "al año". */
export function perPeriod(period: string): string {
  if (period === 'MONTHLY') return 'por mes';
  if (period === 'ANNUAL') return 'al año';
  return `cada ${periodNoun(period)}`;
}

/** Meses que dura un periodo (para dividir un costo mensual, por ejemplo). */
export function periodMonths(period: string): number {
  return BILLING_PERIOD_OPTIONS.find((o) => o.value === period)?.months ?? 1;
}
