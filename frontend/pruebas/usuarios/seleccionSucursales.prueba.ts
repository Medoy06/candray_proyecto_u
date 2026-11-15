// =============================================================================
// seleccionSucursales.prueba.ts
// Qué prueba:   la regla de la sucursal predeterminada: la primera marcada lo es,
//               siempre es una de las marcadas, y al desmarcarla pasa a la
//               primera que quede (o a ninguna).
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  EMPTY_SELECTION,
  sameSelection,
  selectionFromBranches,
  setDefaultBranch,
  toggleBranch,
} from '../../src/paginas/usuarios/seleccionSucursales';

describe('seleccionSucursales', () => {
  it('al marcar la primera, es la predeterminada', () => {
    expect(toggleBranch(EMPTY_SELECTION, 'a')).toEqual({ ids: ['a'], defaultId: 'a' });
  });

  it('al marcar otra, la predeterminada no cambia', () => {
    const s = toggleBranch(toggleBranch(EMPTY_SELECTION, 'a'), 'b');
    expect(s).toEqual({ ids: ['a', 'b'], defaultId: 'a' });
  });

  it('al desmarcar la predeterminada, pasa a la primera que queda', () => {
    const s = toggleBranch({ ids: ['a', 'b', 'c'], defaultId: 'a' }, 'a');
    expect(s).toEqual({ ids: ['b', 'c'], defaultId: 'b' });
  });

  it('al desmarcar otra, la predeterminada se mantiene', () => {
    const s = toggleBranch({ ids: ['a', 'b'], defaultId: 'a' }, 'b');
    expect(s).toEqual({ ids: ['a'], defaultId: 'a' });
  });

  it('al desmarcar la última, no queda predeterminada', () => {
    expect(toggleBranch({ ids: ['a'], defaultId: 'a' }, 'a')).toEqual({ ids: [], defaultId: null });
  });

  it('setDefaultBranch cambia la predeterminada entre las marcadas', () => {
    expect(setDefaultBranch({ ids: ['a', 'b'], defaultId: 'a' }, 'b').defaultId).toBe('b');
  });

  it('setDefaultBranch ignora una sucursal que no está marcada', () => {
    const s = { ids: ['a'], defaultId: 'a' };
    expect(setDefaultBranch(s, 'z')).toBe(s);
  });
});

describe('selectionFromBranches y sameSelection', () => {
  it('toma la predeterminada marcada por el servidor', () => {
    expect(selectionFromBranches([{ id: 'a', is_default: false }, { id: 'b', is_default: true }])).toEqual({
      ids: ['a', 'b'],
      defaultId: 'b',
    });
  });

  it('sin ninguna marcada como predeterminada, usa la primera; sin sucursales, ninguna', () => {
    expect(selectionFromBranches([{ id: 'a', is_default: false }]).defaultId).toBe('a');
    expect(selectionFromBranches([])).toEqual({ ids: [], defaultId: null });
  });

  it('dos selecciones con las mismas sucursales en otro orden son iguales', () => {
    expect(sameSelection({ ids: ['a', 'b'], defaultId: 'a' }, { ids: ['b', 'a'], defaultId: 'a' })).toBe(true);
  });

  it('cambiar la predeterminada, quitar o agregar una sucursal las hace distintas', () => {
    const base = { ids: ['a', 'b'], defaultId: 'a' };
    expect(sameSelection(base, { ids: ['a', 'b'], defaultId: 'b' })).toBe(false);
    expect(sameSelection(base, { ids: ['a'], defaultId: 'a' })).toBe(false);
    expect(sameSelection(base, { ids: ['a', 'b', 'c'], defaultId: 'a' })).toBe(false);
  });
});
