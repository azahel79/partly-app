import { MembershipStatus } from '@prisma/client';
import { seatStats } from '../src/common/utils/seats.util';

describe('seats.util', () => {
  it('cuenta todas las reservas antes de iniciar el grupo', () => {
    const result = seatStats(
      [
        { status: MembershipStatus.RESERVED, autoRenew: true, currentPeriodEnd: new Date('2026-10-01') },
        { status: MembershipStatus.ACTIVE, autoRenew: true, currentPeriodEnd: new Date('2026-10-01') },
      ],
      false,
    );
    expect(result).toEqual({ reservedSlots: 2, nextCycleReserved: 0, freeingSlots: 0, freeingDate: null });
  });

  it('separa ocupantes actuales y reservas del siguiente ciclo', () => {
    const result = seatStats(
      [
        { status: MembershipStatus.ACTIVE, autoRenew: false, currentPeriodEnd: new Date('2026-10-01') },
        { status: MembershipStatus.ACTIVE, autoRenew: false, currentPeriodEnd: new Date('2026-10-10') },
        { status: MembershipStatus.RESERVED, autoRenew: true, currentPeriodEnd: new Date('2026-10-01') },
      ],
      true,
    );
    expect(result.reservedSlots).toBe(2);
    expect(result.nextCycleReserved).toBe(1);
    expect(result.freeingSlots).toBe(1);
    expect(result.freeingDate?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});
