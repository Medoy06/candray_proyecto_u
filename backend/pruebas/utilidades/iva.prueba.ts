// =============================================================================
// iva.prueba.ts
// Qué prueba:   el desglose del IVA de un total que ya lo incluye (iva.ts).
// Cómo:         llama a la función directamente, sin base de datos.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { splitVat } from '../../src/utilidades/iva';

describe('splitVat', () => {
  it('separa el IVA del 13 % de un total que lo incluye', () => {
    // 113 = 100 + 13 % de 100.
    expect(splitVat(113)).toEqual({ subtotal: 100, tax: 13 });
  });

  it('redondea el subtotal al centavo y el IVA es lo que resta', () => {
    // 120 / 1.13 = 106.1946... -> 106.19; el IVA es 120 - 106.19 = 13.81.
    expect(splitVat(120)).toEqual({ subtotal: 106.19, tax: 13.81 });
  });

  it('subtotal más IVA da siempre el total, sin errores de decimales', () => {
    for (const total of [0.01, 0.1, 9.99, 33.33, 99.99, 250.5, 1234.56, 99999.99]) {
      const { subtotal, tax } = splitVat(total);
      expect(Math.round((subtotal + tax) * 100)).toBe(Math.round(total * 100));
      expect(tax).toBeGreaterThanOrEqual(0);
    }
  });

  it('un total de cero no tiene IVA', () => {
    expect(splitVat(0)).toEqual({ subtotal: 0, tax: 0 });
  });
});
