// =============================================================================
// fechaLocal.prueba.ts
// Qué prueba:   todayText, addDays y weekdayName: que calculen bien los días,
//               incluidos cambios de mes y de año y años bisiestos.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { addDays, todayText, weekdayName } from '../../src/utilidades/fechaLocal';

describe('todayText', () => {
  it('escribe la fecha local con ceros a la izquierda', () => {
    expect(todayText(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(todayText(new Date(2026, 10, 15))).toBe('2026-11-15');
  });
});

describe('addDays', () => {
  it('suma y resta días dentro del mes', () => {
    expect(addDays('2026-11-15', 1)).toBe('2026-11-16');
    expect(addDays('2026-11-15', -1)).toBe('2026-11-14');
    expect(addDays('2026-11-15', 0)).toBe('2026-11-15');
  });

  it('cruza el fin de mes y de año', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('respeta los años bisiestos', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });
});

describe('weekdayName', () => {
  it('da el día de la semana en español', () => {
    expect(weekdayName('2026-11-15')).toBe('domingo');
    expect(weekdayName('2026-11-16')).toBe('lunes');
    expect(weekdayName('2026-11-20')).toBe('viernes');
  });
});
