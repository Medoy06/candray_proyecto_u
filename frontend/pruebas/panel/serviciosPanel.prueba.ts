// =============================================================================
// serviciosPanel.prueba.ts
// Qué prueba:   que getPanel() pida la dirección correcta, sin parámetros, y
//               devuelva el panel tal como llega, y que no exista ninguna otra
//               llamada (el panel es solo lectura).
// =============================================================================
import { describe, expect, it } from 'vitest';
import * as servicio from '../../src/servicios/panel';
import { installFakeApi } from '../ayudas/apiFalsa';

const PANEL = { as_of: '2026-11-16', totals: {}, branches: [{ branch_id: 'b1', branch_name: 'Candray Central' }] };

describe('getPanel', () => {
  it('pide GET /panel sin parámetros y devuelve el panel', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: PANEL } }));
    expect(await servicio.getPanel()).toEqual(PANEL);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ method: 'get', url: '/panel' });
    expect(received[0].params).toBeUndefined();
  });

  it('si el servidor falla, la llamada falla', async () => {
    installFakeApi(() => ({ status: 403, data: { message: 'No tiene permiso.' } }));
    await expect(servicio.getPanel()).rejects.toThrow();
  });

  it('solo existe esa llamada: nada para escribir', () => {
    expect(Object.keys(servicio).filter((key) => typeof (servicio as Record<string, unknown>)[key] === 'function')).toEqual(['getPanel']);
  });
});
