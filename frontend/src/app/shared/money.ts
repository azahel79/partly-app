import { Pipe, PipeTransform } from '@angular/core';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/**
 * Formato único de dinero en panel y admin: `$1,460.00`, y `−$270.00` para
 * pérdidas (signo menos tipográfico, no guion). Acepta los montos como vienen
 * del backend (Prisma Decimal llega como string).
 */
export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value) + 0; // + 0 convierte -0 en 0 para no mostrar "−$0.00"
  if (!Number.isFinite(n)) return '—';
  return MXN.format(n).replace('-', '−');
}

/** `{{ monto | money }}` en las plantillas; mismo formato que `formatMoney`. */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    return formatMoney(value);
  }
}
