import { BillingPeriod } from '@prisma/client';
import { wholesaleCoversNextPeriod } from '../src/common/utils/wholesale-coverage.util';

const DAY = 24 * 60 * 60 * 1000;
const corte = new Date('2026-10-28T00:00:00.000Z'); // el siguiente mes termina el 28 nov

describe('wholesaleCoversNextPeriod', () => {
  it('un grupo que no viene del mayoreo siempre se cobra', () => {
    expect(wholesaleCoversNextPeriod(null, corte, BillingPeriod.MONTHLY)).toBe(true);
  });

  it('cuenta sin renovar (vence cerca del corte): no se cobra la renovación', () => {
    expect(wholesaleCoversNextPeriod(new Date(corte.getTime() + 1 * DAY), corte, BillingPeriod.MONTHLY)).toBe(false);
  });

  it('cuenta que vence a mitad del siguiente mes: tampoco se cobra', () => {
    expect(wholesaleCoversNextPeriod(new Date('2026-11-04T22:53:00.000Z'), corte, BillingPeriod.MONTHLY)).toBe(false);
  });

  it('cuenta renovada 30 días (vence un par de días antes del fin del mes siguiente): sí se cobra', () => {
    expect(wholesaleCoversNextPeriod(new Date('2026-11-26T12:00:00.000Z'), corte, BillingPeriod.MONTHLY)).toBe(true);
  });

  it('cuenta vigente después del siguiente mes: sí se cobra', () => {
    expect(wholesaleCoversNextPeriod(new Date('2026-12-15T00:00:00.000Z'), corte, BillingPeriod.MONTHLY)).toBe(true);
  });
});
