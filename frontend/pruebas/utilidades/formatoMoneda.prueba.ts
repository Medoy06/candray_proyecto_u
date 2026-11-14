// =============================================================================
// formatoMoneda.prueba.ts
// Qué prueba:   que los montos se escriben en dólares al estilo de El Salvador y
//               que un dato ausente o inválido nunca muestra "NaN" ni "$0.00".
// =============================================================================
import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../src/utilidades/formatoMoneda';

describe('formatMoney', () => {
  it.each([
    [1234.5, '$1,234.50'],
    ['1234.50', '$1,234.50'], // la base entrega los NUMERIC como texto
    ['0.00', '$0.00'],
    [0, '$0.00'],
    ['99999999.99', '$99,999,999.99'],
    [-5, '-$5.00'],
    ['2.005', '$2.01'],
  ])('%s -> %s', (value, expected) => {
    expect(formatMoney(value)).toBe(expected);
  });

  it.each([null, undefined, '', 'abc', NaN, Infinity])('%s -> "—" (sin dato)', (value) => {
    expect(formatMoney(value as never)).toBe('—');
  });

  it('un cero real NO se confunde con "sin dato"', () => {
    expect(formatMoney(0)).not.toBe('—');
    expect(formatMoney('0')).toBe('$0.00');
  });
});
