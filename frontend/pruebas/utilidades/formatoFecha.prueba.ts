// =============================================================================
// formatoFecha.prueba.ts
// Qué prueba:   que las fechas y horas se escriben al estilo de El Salvador SIN
//               correr la hora por zona horaria, y que los datos inválidos dan "—".
// Nota:         estas pruebas deben pasar con cualquier zona horaria del equipo.
//               Para comprobarlo:  TZ=Asia/Tokyo npm test   (y TZ=America/El_Salvador)
// =============================================================================
import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatTime } from '../../src/utilidades/formatoFecha';

describe('formatDate', () => {
  it.each([
    ['2026-11-13', '13/11/2026'],
    ['2026-11-13 14:05:00', '13/11/2026'],
    ['2026-01-05T09:00:00', '05/01/2026'],
    ['2024-02-29', '29/02/2024'], // año bisiesto
  ])('%s -> %s', (value, expected) => {
    expect(formatDate(value)).toBe(expected);
  });

  it('NO cambia el día cerca de la medianoche (sin conversión de zona)', () => {
    expect(formatDate('2026-11-13 23:59:59')).toBe('13/11/2026');
    expect(formatDate('2026-11-13 00:00:00')).toBe('13/11/2026');
  });
});

describe('formatDateTime', () => {
  it.each([
    ['2026-11-13 14:05:00', '13/11/2026 14:05'],
    ['2026-11-13 14:05:09.123456', '13/11/2026 14:05'], // fracciones de segundo de la base
    ['2026-11-13T08:00', '13/11/2026 08:00'],
    ['2026-11-13 23:30:00', '13/11/2026 23:30'], // NO pasa al día siguiente
    ['2026-11-13 00:05:00', '13/11/2026 00:05'], // NO pasa al día anterior
    ['2026-11-13', '13/11/2026'], // sin hora: solo la fecha
  ])('%s -> %s', (value, expected) => {
    expect(formatDateTime(value)).toBe(expected);
  });
});

describe('formatTime', () => {
  it.each([
    ['08:00:00', '08:00'], // columnas time de la base
    ['17:30', '17:30'],
    ['2026-11-13 14:05:00', '14:05'],
  ])('%s -> %s', (value, expected) => {
    expect(formatTime(value)).toBe(expected);
  });

  it('una fecha sin hora no tiene hora que mostrar', () => {
    expect(formatTime('2026-11-13')).toBe('—');
  });
});

describe('valores inválidos', () => {
  it.each([null, undefined, '', 'abc', '13/11/2026', '2026-13-01', '2026-02-31', '2026-11-13 25:00:00', '2026-11-13 10:75:00'])(
    '%s -> "—" en las tres funciones',
    (value) => {
      expect(formatDate(value as never)).toBe('—');
      expect(formatDateTime(value as never)).toBe('—');
      expect(formatTime(value as never)).toBe('—');
    },
  );

  it('una hora imposible sola también da "—"', () => {
    expect(formatTime('25:00')).toBe('—');
    expect(formatTime('10:75')).toBe('—');
  });
});
