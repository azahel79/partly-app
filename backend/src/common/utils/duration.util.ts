const UNIT_TO_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Convierte duraciones simples ("15m", "30d", "12h") en una fecha futura a partir de `from`. */
export function addDuration(from: Date, duration: string): Date {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Formato de duración inválido: "${duration}". Usa por ejemplo "15m" o "30d".`);
  }
  const [, amountStr, unit] = match;
  const ms = Number(amountStr) * UNIT_TO_MS[unit];
  return new Date(from.getTime() + ms);
}
