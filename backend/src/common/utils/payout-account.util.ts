export type PayoutNumberType = 'CLABE' | 'DEBIT_CARD';

export interface PayoutNumberInspection {
  digits: string;
  type: PayoutNumberType | null;
  isComplete: boolean;
  isValid: boolean;
}

function hasRepeatedSingleDigit(value: string): boolean {
  return /^(\d)\1+$/.test(value);
}

function isValidLuhn(value: string): boolean {
  if (value.length !== 16 || hasRepeatedSingleDigit(value)) return false;

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

function isValidClabe(value: string): boolean {
  if (value.length !== 18 || hasRepeatedSingleDigit(value)) return false;

  const weights = [3, 7, 1];
  const sum = value
    .slice(0, 17)
    .split('')
    .reduce((total, digit, index) => total + ((Number(digit) * weights[index % 3]) % 10), 0);
  return (10 - (sum % 10)) % 10 === Number(value[17]);
}

export function inspectPayoutAccountNumber(value: string): PayoutNumberInspection {
  const digits = value.replace(/\D/g, '').slice(0, 18);
  const type: PayoutNumberType | null = digits.length === 16
    ? 'DEBIT_CARD'
    : digits.length === 18
      ? 'CLABE'
      : null;

  return {
    digits,
    type,
    isComplete: type !== null,
    isValid: type === 'DEBIT_CARD' ? isValidLuhn(digits) : type === 'CLABE' ? isValidClabe(digits) : false,
  };
}
