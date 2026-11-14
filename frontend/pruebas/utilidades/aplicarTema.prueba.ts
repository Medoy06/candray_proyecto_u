// =============================================================================
// aplicarTema.prueba.ts
// Qué prueba:   que el color de la sucursal se aplica a la interfaz, y que un
//               valor inválido nunca se escribe en el estilo de la página.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { applyBranchTheme, DEFAULT_ACCENT } from '../../src/tema/aplicarTema';

const accent = () => document.documentElement.style.getPropertyValue('--acento');

describe('applyBranchTheme', () => {
  it('aplica el color de la sucursal', () => {
    applyBranchTheme('#1D4ED8');
    expect(accent()).toBe('#1D4ED8');
  });

  it('null vuelve al color de partida', () => {
    applyBranchTheme('#1D4ED8');
    applyBranchTheme(null);
    expect(accent()).toBe(DEFAULT_ACCENT);
  });

  it.each(['rojo', '#12345', '#GGGGGG', 'red; background: url(x)', '#1D4ED8; x', ''])(
    'el valor inválido %j NO se escribe: queda el color de partida',
    (value) => {
      applyBranchTheme(value);
      expect(accent()).toBe(DEFAULT_ACCENT);
    },
  );
});
