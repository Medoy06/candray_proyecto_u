// =============================================================================
// franjasYFechas.prueba.ts
// Qué prueba:   las funciones puras de franjas de 30 minutos (franjas.ts) y de
//               fechas en la hora de El Salvador (fechas.ts).
// Cómo:         llama a las funciones directamente, sin base de datos.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { isoWeekday, nowInElSalvador, todayInElSalvador } from '../../src/utilidades/fechas';
import { SLOT_MINUTES, slotStartsInBlock, toHourMinute, toMinutes } from '../../src/utilidades/franjas';

describe('franjas', () => {
  it('las citas duran 30 minutos', () => {
    expect(SLOT_MINUTES).toBe(30);
  });

  it('convierte horas en minutos y de vuelta', () => {
    expect(toMinutes('08:30')).toBe(510);
    expect(toMinutes('08:30:00')).toBe(510);
    expect(toMinutes('00:00')).toBe(0);
    expect(toHourMinute(510)).toBe('08:30');
    expect(toHourMinute(0)).toBe('00:00');
    expect(toHourMinute(23 * 60 + 30)).toBe('23:30');
  });

  it('un bloque de 8:00 a 10:00 tiene cuatro franjas', () => {
    expect(slotStartsInBlock('08:00', '10:00')).toEqual(['08:00', '08:30', '09:00', '09:30']);
  });

  it('acepta horas con segundos (como las devuelve la base)', () => {
    expect(slotStartsInBlock('08:00:00', '09:00:00')).toEqual(['08:00', '08:30']);
  });

  it('un bloque de media hora tiene una sola franja', () => {
    expect(slotStartsInBlock('13:30', '14:00')).toEqual(['13:30']);
  });

  it('un bloque más corto que una cita no tiene franjas', () => {
    expect(slotStartsInBlock('08:00', '08:20')).toEqual([]);
    expect(slotStartsInBlock('08:00', '08:00')).toEqual([]);
  });

  it('la última franja termina justo al cierre del bloque', () => {
    const slots = slotStartsInBlock('14:00', '17:00');
    expect(slots.at(-1)).toBe('16:30');
    expect(slots).toHaveLength(6);
  });
});

describe('fechas', () => {
  it('calcula el día de la semana ISO (1 = lunes ... 7 = domingo)', () => {
    expect(isoWeekday('2026-11-15')).toBe(7); // domingo
    expect(isoWeekday('2026-11-16')).toBe(1); // lunes
    expect(isoWeekday('2026-11-20')).toBe(5); // viernes
    expect(isoWeekday('2026-11-21')).toBe(6); // sábado
  });

  it('la fecha de hoy tiene formato AAAA-MM-DD', () => {
    expect(todayInElSalvador()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('la hora actual tiene formato AAAA-MM-DD HH:MM y empieza con la fecha de hoy', () => {
    const now = nowInElSalvador();
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/);
    // Puede fallar solo si la medianoche cae justo entre las dos llamadas.
    expect(now.startsWith(todayInElSalvador())).toBe(true);
  });
});
