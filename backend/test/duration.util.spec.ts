import { addDuration } from '../src/common/utils/duration.util';

describe('duration.util', () => {
  const base = new Date('2026-09-25T12:00:00.000Z');

  it.each([
    ['30s', '2026-09-25T12:00:30.000Z'],
    ['15m', '2026-09-25T12:15:00.000Z'],
    ['12h', '2026-09-26T00:00:00.000Z'],
    ['2d', '2026-09-27T12:00:00.000Z'],
  ])('suma la duración %s', (duration, expected) => {
    expect(addDuration(base, duration).toISOString()).toBe(expected);
  });

  it('rechaza formatos ambiguos', () => {
    expect(() => addDuration(base, '1 month')).toThrow('Formato de duración inválido');
  });
});
