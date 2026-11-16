// =============================================================================
// serviciosRecordatorios.prueba.ts
// Qué prueba:   que listReminders() pida la dirección correcta y devuelva las
//               filas tal como llegan, y que no exista ninguna llamada de escritura.
// =============================================================================
import { describe, expect, it } from 'vitest';
import * as servicio from '../../src/servicios/recordatorios';
import { installFakeApi } from '../ayudas/apiFalsa';

describe('listReminders', () => {
  it('pide GET /recordatorios sin parámetros y devuelve las filas', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [{ appointment_id: 'a1' }] } }));
    expect(await servicio.listReminders()).toEqual([{ appointment_id: 'a1' }]);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ method: 'get', url: '/recordatorios' });
    expect(received[0].params).toBeUndefined();
  });

  it('si el servidor falla, la llamada falla', async () => {
    installFakeApi(() => ({ status: 500, data: {} }));
    await expect(servicio.listReminders()).rejects.toThrow();
  });

  it('solo existe esa llamada: nada para enviar ni guardar', () => {
    expect(Object.keys(servicio).filter((key) => typeof (servicio as Record<string, unknown>)[key] === 'function')).toEqual(['listReminders']);
  });
});
