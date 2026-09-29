import { inspectPayoutAccountNumber } from '../src/common/utils/payout-account.util';

describe('inspectPayoutAccountNumber', () => {
  it('acepta una tarjeta de débito de 16 dígitos que cumple Luhn', () => {
    expect(inspectPayoutAccountNumber('4111 1111 1111 1111')).toEqual({
      digits: '4111111111111111',
      type: 'DEBIT_CARD',
      isComplete: true,
      isValid: true,
    });
  });

  it('rechaza como tarjeta un prefijo CLABE incompleto de 16 dígitos', () => {
    const result = inspectPayoutAccountNumber('0121800159786225');
    expect(result.type).toBe('DEBIT_CARD');
    expect(result.isValid).toBe(false);
  });

  it('valida una CLABE de 18 dígitos con su verificador', () => {
    const base = '01218001597862250';
    const weights = [3, 7, 1];
    const sum = base.split('').reduce((total, digit, index) => total + ((Number(digit) * weights[index % 3]) % 10), 0);
    const clabe = `${base}${(10 - (sum % 10)) % 10}`;
    const result = inspectPayoutAccountNumber(clabe);

    expect(result.type).toBe('CLABE');
    expect(result.isValid).toBe(true);
  });

  it('no acepta secuencias repetidas aunque matemáticamente pasen el verificador', () => {
    expect(inspectPayoutAccountNumber('0000000000000000').isValid).toBe(false);
    expect(inspectPayoutAccountNumber('000000000000000000').isValid).toBe(false);
  });
});
