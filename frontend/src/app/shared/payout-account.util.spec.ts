import { describe, expect, it } from 'vitest';
import { inspectPayoutAccount } from './payout-account.util';

describe('inspectPayoutAccount', () => {
  it('detecta y valida una tarjeta de débito de 16 dígitos', () => {
    expect(inspectPayoutAccount('4111 1111 1111 1111')).toEqual({
      digits: '4111111111111111',
      type: 'DEBIT_CARD',
      bankName: null,
      isComplete: true,
      isValid: true,
    });
  });

  it('no confunde los primeros 16 dígitos de una CLABE con una tarjeta válida', () => {
    const result = inspectPayoutAccount('0121800159786225');
    expect(result.type).toBe('DEBIT_CARD');
    expect(result.bankName).toBeNull();
    expect(result.isValid).toBe(false);
  });

  it('detecta banco y valida una CLABE completa', () => {
    const base = '01218001597862250';
    const weights = [3, 7, 1];
    const sum = base.split('').reduce((total, digit, index) => total + ((Number(digit) * weights[index % 3]) % 10), 0);
    const result = inspectPayoutAccount(`${base}${(10 - (sum % 10)) % 10}`);

    expect(result.type).toBe('CLABE');
    expect(result.bankName).toBe('BBVA México');
    expect(result.isValid).toBe(true);
  });

  it('mantiene 17 dígitos como dato incompleto', () => {
    expect(inspectPayoutAccount('01218001597862250')).toMatchObject({
      type: null,
      isComplete: false,
      isValid: false,
    });
  });

  it('rechaza secuencias repetidas tanto en tarjeta como en CLABE', () => {
    expect(inspectPayoutAccount('0000000000000000').isValid).toBe(false);
    expect(inspectPayoutAccount('000000000000000000').isValid).toBe(false);
  });
});
