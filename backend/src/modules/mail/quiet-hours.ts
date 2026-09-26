const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Hora local (y minutos) de `date` en una zona horaria. */
function localTime(date: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { hour, minute };
}

/**
 * Los recordatorios no deben llegar de madrugada. Si `now` cae fuera de la ventana de envío
 * (por defecto de 8:00 a 21:00, hora de Ciudad de México), regresa el momento en que abre la
 * siguiente (las 8:00 en punto); si ya está dentro de la ventana, regresa null (enviar ya).
 */
export function deferToDaytime(now: Date, options: { timeZone?: string; fromHour?: number; toHour?: number } = {}): Date | null {
  const { timeZone = 'America/Mexico_City', fromHour = 8, toHour = 21 } = options;
  const { hour, minute } = localTime(now, timeZone);
  if (hour >= fromHour && hour < toHour) {
    return null;
  }
  const hoursToWait = hour >= toHour ? 24 - hour + fromHour : fromHour - hour;
  return new Date(now.getTime() + hoursToWait * HOUR_MS - minute * MINUTE_MS);
}

/** Día calendario (AAAA-MM-DD) de `date` en una zona horaria: sirve para "un recordatorio por día". */
export function dayKey(date: Date, timeZone = 'America/Mexico_City'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
