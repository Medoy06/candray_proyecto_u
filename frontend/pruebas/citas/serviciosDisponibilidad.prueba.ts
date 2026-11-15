// =============================================================================
// serviciosDisponibilidad.prueba.ts
// Qué prueba:   que getAvailability pida al servidor el día y la sucursal
//               correctos y devuelva la disponibilidad tal cual llega.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { getAvailability } from '../../src/servicios/disponibilidad';
import { installFakeApi } from '../ayudas/apiFalsa';

describe('getAvailability', () => {
  it('hace GET a /disponibilidad con la fecha y la sucursal', async () => {
    const day = { date: '2026-11-16', branch_id: 'b1', weekday: 1, doctors: [] };
    const received = installFakeApi(() => ({ status: 200, data: { data: day } }));
    expect(await getAvailability('2026-11-16', 'b1')).toEqual(day);
    expect(received[0]).toMatchObject({ method: 'get', url: '/disponibilidad', params: { date: '2026-11-16', branch_id: 'b1' } });
  });
});
