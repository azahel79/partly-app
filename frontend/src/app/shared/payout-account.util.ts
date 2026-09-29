import { CLABE_BANKS, inspectClabe } from './clabe.util';

export type PayoutAccountType = 'CLABE' | 'DEBIT_CARD';

export interface PayoutAccountInfo {
  digits: string;
  type: PayoutAccountType | null;
  bankName: string | null;
  isComplete: boolean;
  isValid: boolean;
}

export const PAYOUT_BANK_OPTIONS = Array.from(new Set(Object.values(CLABE_BANKS)))
  .sort((left, right) => left.localeCompare(right, 'es-MX'));

function isValidLuhn(value: string): boolean {
  if (value.length !== 16 || /^(\d)\1+$/.test(value)) return false;

  let sum = 0;
  let doubleDigit = false;
  for (let index = value.length - 1; index >= 0; index--) {
    let digit = Number(value[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

export function inspectPayoutAccount(value: string): PayoutAccountInfo {
  const digits = value.replace(/\D/g, '').slice(0, 18);

  if (digits.length === 16) {
    return {
      digits,
      type: 'DEBIT_CARD',
      bankName: null,
      isComplete: true,
      isValid: isValidLuhn(digits),
    };
  }

  if (digits.length === 18) {
    const clabe = inspectClabe(digits);
    return {
      digits,
      type: 'CLABE',
      bankName: clabe.bankName,
      isComplete: true,
      isValid: clabe.isValid,
    };
  }

  return { digits, type: null, bankName: null, isComplete: false, isValid: false };
}
