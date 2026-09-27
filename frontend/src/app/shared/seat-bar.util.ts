/** Estado de cada lugar en la barra `.ui-seats` (app-ui.css). */
export type SeatState = 'taken' | 'freeing' | 'held' | '';

interface SeatCounts {
  availableSlots: number;
  occupiedSlots: number;
  heldSlots?: number;
  freeingSlots?: number;
}

/**
 * Un segmento por lugar, en este orden: ocupados, por liberarse (miembros que no
 * renuevan), apartados (reservados o pagando) y libres.
 */
export function seatSegments(g: SeatCounts): SeatState[] {
  const total = Math.max(g.availableSlots, 0);
  const occupied = Math.min(g.occupiedSlots, total);
  const freeing = Math.min(g.freeingSlots ?? 0, occupied);
  const held = Math.min(g.heldSlots ?? 0, total - occupied);
  return Array.from({ length: total }, (_, i) => {
    if (i < occupied - freeing) return 'taken';
    if (i < occupied) return 'freeing';
    if (i < occupied + held) return 'held';
    return '';
  });
}
