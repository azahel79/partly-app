import { describe, expect, it } from 'vitest';
import { inspectClabe } from './clabe.util';

describe('inspectClabe', () => {
  it('normaliza caracteres no numéricos y limita a 18 dígitos', () => {
    expect(inspectClabe('002-010-07777777777-99').digits).toBe('002010077777777779');
  });

  it('identifica el banco por los primeros tres dígitos', () => {
    const result = inspectClabe('012');
    expect(result.bankCode).toBe('012');
    expect(result.bankName).toBe('BBVA México');
    expect(result.isComplete).toBe(false);
  });

  it('valida el dígito verificador de una CLABE', () => {
    const base = '00201007777777777';
    const weights = [3, 7, 1];
    const sum = base.split('').reduce((total, digit, index) => total + ((Number(digit) * weights[index % 3]) % 10), 0);
    const valid = `${base}${(10 - (sum % 10)) % 10}`;

    expect(inspectClabe(valid).isValid).toBe(true);
    expect(inspectClabe(`${base}${Number(valid[17]) === 9 ? 0 : Number(valid[17]) + 1}`).isValid).toBe(false);
  });
});
