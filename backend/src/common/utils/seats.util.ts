import { MembershipStatus } from '@prisma/client';

export interface SeatMembership {
  status: MembershipStatus;
  autoRenew: boolean;
  currentPeriodEnd: Date;
}

export interface SeatStats {
  /** Cupos apartados hoy: antes de iniciar, todas las reservas; ya iniciado, solo quien ocupa o está pagando. */
  reservedSlots: number;
  /** Cupos ya prometidos a alguien que apartó un lugar que se libera (solo grupos iniciados). */
  nextCycleReserved: number;
  /** Lugares que se van a liberar y todavía no tienen a nadie esperando (lo que otro comprador puede apartar). */
  freeingSlots: number;
  /** Cuándo se libera el primero de esos lugares (fin del periodo de quien no renovará). */
  freeingDate: Date | null;
}

/**
 * Cuenta los cupos de un grupo a partir de sus membresías vivas. Un grupo ya iniciado distingue entre los lugares
 * ocupados hoy y los que se liberarán al terminar el ciclo (miembros con la renovación apagada), que otro
 * comprador puede apartar sin pagar todavía.
 */
export function seatStats(memberships: SeatMembership[], started: boolean): SeatStats {
  if (!started) {
    return { reservedSlots: memberships.length, nextCycleReserved: 0, freeingSlots: 0, freeingDate: null };
  }
  const holding = memberships.filter((m) => m.status !== MembershipStatus.RESERVED);
  const waiting = memberships.filter((m) => m.status === MembershipStatus.RESERVED).length;
  const leaving = memberships.filter((m) => m.status === MembershipStatus.ACTIVE && !m.autoRenew);
  const freeingDate = leaving.length > 0 ? new Date(Math.min(...leaving.map((m) => m.currentPeriodEnd.getTime()))) : null;
  return {
    reservedSlots: holding.length,
    nextCycleReserved: waiting,
    freeingSlots: Math.max(0, leaving.length - waiting),
    freeingDate,
  };
}
