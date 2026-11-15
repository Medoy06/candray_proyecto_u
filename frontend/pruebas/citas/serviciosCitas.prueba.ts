// =============================================================================
// serviciosCitas.prueba.ts
// Qué prueba:   que listAppointments y changeAppointmentStatus envíen al
//               servidor la ruta, el método, los parámetros y el cuerpo
//               correctos, y que devuelvan lo que corresponde.
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  APPOINTMENT_PAGE_SIZE,
  changeAppointmentStatus,
  createAppointment,
  listAppointments,
  rescheduleAppointment,
} from '../../src/servicios/citas';
import { installFakeApi } from '../ayudas/apiFalsa';

const PAGINATION = { page: 1, page_size: 50, total: 1, total_pages: 1 };

describe('listAppointments', () => {
  it('pide el día, la sucursal y la página, sin estado si no se eligió', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [], pagination: PAGINATION } }));
    await listAppointments({ date: '2026-11-16', branchId: 'b1', status: '' }, 2);
    expect(received[0]).toMatchObject({ method: 'get', url: '/citas' });
    expect(received[0].params).toEqual({ date: '2026-11-16', branch_id: 'b1', page: 2, page_size: APPOINTMENT_PAGE_SIZE });
  });

  it('sin sucursal (null) no envía branch_id: el servidor devuelve todas las del usuario', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [], pagination: PAGINATION } }));
    await listAppointments({ date: '2026-11-16', branchId: null, status: '' }, 1);
    expect(received[0].params).toEqual({ date: '2026-11-16', page: 1, page_size: APPOINTMENT_PAGE_SIZE });
    expect(received[0].params).not.toHaveProperty('branch_id');
  });

  it('con un estado elegido lo envía', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [], pagination: PAGINATION } }));
    await listAppointments({ date: '2026-11-16', branchId: 'b1', status: 'no_show' }, 1);
    expect(received[0].params).toMatchObject({ status: 'no_show' });
  });

  it('devuelve las filas y la paginación', async () => {
    installFakeApi(() => ({ status: 200, data: { data: [{ id: 'c1' }], pagination: PAGINATION } }));
    expect(await listAppointments({ date: '2026-11-16', branchId: 'b1', status: '' }, 1)).toEqual({
      rows: [{ id: 'c1' }],
      pagination: PAGINATION,
    });
  });
});

describe('changeAppointmentStatus', () => {
  it('hace PATCH a /citas/:id/estado y devuelve la cita', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: { id: 'c9' } } }));
    expect(await changeAppointmentStatus('c9', 'completed')).toEqual({ id: 'c9' });
    expect(received[0]).toMatchObject({ method: 'patch', url: '/citas/c9/estado', body: { status: 'completed' } });
  });

  it('al cancelar envía el motivo (o null si no hay)', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: {} } }));
    await changeAppointmentStatus('c9', 'cancelled', 'El paciente avisó');
    await changeAppointmentStatus('c9', 'cancelled', null);
    await changeAppointmentStatus('c9', 'cancelled');
    expect(received[0].body).toEqual({ status: 'cancelled', cancellation_reason: 'El paciente avisó' });
    expect(received[1].body).toEqual({ status: 'cancelled', cancellation_reason: null });
    expect(received[2].body).toEqual({ status: 'cancelled' });
  });

  it('nunca envía el motivo si no se está cancelando (el servidor lo rechazaría)', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: {} } }));
    await changeAppointmentStatus('c9', 'no_show', 'algo');
    expect(received[0].body).toEqual({ status: 'no_show' });
  });
});

describe('createAppointment y rescheduleAppointment', () => {
  it('createAppointment hace POST a /citas con el cuerpo y devuelve la cita', async () => {
    const received = installFakeApi(() => ({ status: 201, data: { data: { id: 'n1' } } }));
    const input = { patient_id: 'p1', doctor_id: 'd1', branch_id: 'b1', date: '2026-11-16', time: '08:00', reason: null };
    expect(await createAppointment(input)).toEqual({ id: 'n1' });
    expect(received[0]).toMatchObject({ method: 'post', url: '/citas', body: input });
  });

  it('rescheduleAppointment hace PATCH a /citas/:id solo con lo enviado', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: { id: 'c7' } } }));
    expect(await rescheduleAppointment('c7', { time: '09:30' })).toEqual({ id: 'c7' });
    expect(received[0]).toMatchObject({ method: 'patch', url: '/citas/c7', body: { time: '09:30' } });
  });
});
