// =============================================================================
// formatoReceta.prueba.ts
// Qué prueba:   cómo se escriben las medidas de la receta.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { formatAxis, formatDiopter, formatPupillaryDistance } from '../../src/paginas/expediente/formatoReceta';

describe('formatoReceta', () => {
  it('las dioptrías llevan signo y dos decimales', () => {
    expect(formatDiopter(1.5)).toBe('+1.50');
    expect(formatDiopter(-2.25)).toBe('-2.25');
    expect(formatDiopter(0.25)).toBe('+0.25');
    expect(formatDiopter(-20)).toBe('-20.00');
  });

  it('cero se escribe sin signo y sin dato es una raya', () => {
    expect(formatDiopter(0)).toBe('0.00');
    expect(formatDiopter(null)).toBe('—');
  });

  it('el eje va en grados', () => {
    expect(formatAxis(90)).toBe('90°');
    expect(formatAxis(null)).toBe('—');
  });

  it('la distancia pupilar lleva un decimal y mm', () => {
    expect(formatPupillaryDistance(62.5)).toBe('62.5 mm');
    expect(formatPupillaryDistance(60)).toBe('60.0 mm');
  });
});
