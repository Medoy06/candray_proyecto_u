// =============================================================================
// serviciosHorarios.prueba.ts
// Qué prueba:   que cada llamada de servicios/horarios.ts use el método, la
//               dirección y el cuerpo correctos y devuelva lo que llega.
// Cómo:         el cliente real con ayudas/apiFalsa.ts.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { createSchedule, deleteSchedule, listSchedules, updateSchedule } from '../../src/servicios/horarios';
import { installFakeApi } from '../ayudas/apiFalsa';

const BLOCK = { id: 'h1', doctor_id: 'u2', weekday: 1 };

describe('servicios de horarios', () => {
  it('listSchedules pide GET /horarios del médico y devuelve la lista', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [BLOCK] } }));
    expect(await listSchedules('u2')).toEqual([BLOCK]);
    expect(received[0]).toMatchObject({ method: 'get', url: '/horarios', params: { doctor_id: 'u2' } });
  });

  it('createSchedule envía POST /horarios con el cuerpo y devuelve el bloque', async () => {
    const received = installFakeApi(() => ({ status: 201, data: { data: BLOCK } }));
    const input = { doctor_id: 'u2', branch_id: 'b1', weekday: 1, start_time: '08:00', end_time: '12:00' };
    expect(await createSchedule(input)).toEqual(BLOCK);
    expect(received[0]).toMatchObject({ method: 'post', url: '/horarios', body: input });
  });

  it('updateSchedule envía PATCH /horarios/:id solo con lo cambiado', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: BLOCK } }));
    expect(await updateSchedule('h1', { end_time: '13:00' })).toEqual(BLOCK);
    expect(received[0]).toMatchObject({ method: 'patch', url: '/horarios/h1', body: { end_time: '13:00' } });
  });

  it('deleteSchedule envía DELETE /horarios/:id', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { success: true, data: null } }));
    await deleteSchedule('h1');
    expect(received[0]).toMatchObject({ method: 'delete', url: '/horarios/h1' });
  });

  it('si el servidor responde con error, la llamada falla', async () => {
    installFakeApi(() => ({ status: 409, data: { message: 'Se cruza.' } }));
    await expect(createSchedule({ doctor_id: 'u2', branch_id: 'b1', weekday: 1, start_time: '08:00', end_time: '09:00' })).rejects.toThrow();
  });
});
