import { BillingPeriod } from '@prisma/client';
import {
  addBillingPeriod,
  computeJoinPricing,
  daysBetween,
  minEntryDays,
  nextOccurrenceOfDay,
  proratedAmount,
} from '../src/common/utils/billing.util';

describe('billing.util', () => {
  it('recorta el día 31 al último día de febrero', () => {
    const result = nextOccurrenceOfDay(31, new Date('2028-02-01T00:00:00.000Z'));
    expect(result.toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  it('salta al mes siguiente cuando el corte de este mes ya pasó', () => {
    const result = nextOccurrenceOfDay(10, new Date('2026-09-10T12:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-10-10T00:00:00.000Z');
  });

  it('avanza el periodo respetando meses cortos', () => {
    const result = addBillingPeriod(new Date('2026-01-31T00:00:00.000Z'), BillingPeriod.MONTHLY);
    expect(result.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });

  it('calcula días completos redondeando hacia arriba', () => {
    expect(daysBetween(new Date('2026-01-01T12:00:00Z'), new Date('2026-01-03T13:00:00Z'))).toBe(3);
    expect(daysBetween(new Date('2026-01-03T00:00:00Z'), new Date('2026-01-01T00:00:00Z'))).toBe(0);
  });

  it('prorratea con precisión de centavos', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-01-31T00:00:00Z');
    expect(proratedAmount(100, start, end, new Date('2026-01-16T00:00:00Z'))).toBe(50);
  });

  it('exige medio ciclo para entrar y 15 días en mensual', () => {
    expect(minEntryDays(BillingPeriod.MONTHLY)).toBe(15);
    expect(minEntryDays(BillingPeriod.ANNUAL)).toBe(180);
  });

  it('devuelve un precio prorrateado entero y no cobra el ciclo siguiente', () => {
    const result = computeJoinPricing(
      99,
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-10-01T00:00:00Z'),
      BillingPeriod.MONTHLY,
      new Date('2026-09-16T00:00:00Z'),
    );
    expect(result).toMatchObject({
      canJoinNow: true,
      isProrated: true,
      prorationAmount: 50,
      includesNextCycle: false,
      amountToPay: 50,
    });
  });
});
