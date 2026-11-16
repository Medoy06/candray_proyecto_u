// =============================================================================
// serviciosExpedientes.prueba.ts
// Qué prueba:   que las llamadas del expediente (historial, consultas pendientes,
//               escribir una nota y enmendarla) envíen al servidor la ruta, el
//               método, los parámetros y el cuerpo correctos, y que devuelvan
//               lo que corresponde. También que NO exista ninguna llamada para
//               editar o borrar una nota.
// =============================================================================
import { describe, expect, it } from 'vitest';
import * as expedientes from '../../src/servicios/expedientes';
import { amendNote, createNote, listPendingConsultations, listRecords, RECORD_PAGE_SIZE } from '../../src/servicios/expedientes';
import { installFakeApi } from '../ayudas/apiFalsa';

const PAGINATION = { page: 2, page_size: 20, total: 30, total_pages: 2 };

describe('listRecords', () => {
  it('pide la página con su tamaño a la ruta del paciente', async () => {
    const received = installFakeApi(() => ({
      status: 200,
      data: { data: [], access: { reason: 'appointment' }, pagination: PAGINATION },
    }));
    await listRecords('p1', 3);
    expect(received[0]).toMatchObject({
      method: 'get',
      url: '/pacientes/p1/expediente',
      params: { page: 3, page_size: RECORD_PAGE_SIZE },
    });
  });

  it('devuelve las filas, el motivo de acceso y la paginación', async () => {
    const access = { reason: 'referral', expiresAt: '2026-12-01 10:00:00' };
    installFakeApi(() => ({ status: 200, data: { data: [{ id: 'r1' }], access, pagination: PAGINATION } }));
    expect(await listRecords('p1', 2)).toEqual({ rows: [{ id: 'r1' }], access, pagination: PAGINATION });
  });
});

describe('listPendingConsultations', () => {
  it('pide las consultas sin nota del paciente y devuelve la lista', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [{ id: 'c1' }] } }));
    expect(await listPendingConsultations('p1')).toEqual([{ id: 'c1' }]);
    expect(received[0]).toMatchObject({ method: 'get', url: '/pacientes/p1/expediente/pendientes' });
  });
});

describe('createNote y amendNote', () => {
  it('createNote hace POST a la ruta del expediente con el cuerpo y devuelve la entrada', async () => {
    const received = installFakeApi(() => ({ status: 201, data: { data: { id: 'n1' } } }));
    const input = { appointment_id: 'c1', diagnosis: 'Miopía', treatment: null, notes: 'Control en 6 meses' };
    expect(await createNote('p1', input)).toEqual({ id: 'n1' });
    expect(received[0]).toMatchObject({ method: 'post', url: '/pacientes/p1/expediente', body: input });
  });

  it('amendNote hace POST a la ruta de enmiendas de esa nota', async () => {
    const received = installFakeApi(() => ({ status: 201, data: { data: { id: 'e1' } } }));
    const input = { diagnosis: 'Miopía moderada', treatment: 'Lentes', notes: null };
    expect(await amendNote('p1', 'n1', input)).toEqual({ id: 'e1' });
    expect(received[0]).toMatchObject({ method: 'post', url: '/pacientes/p1/expediente/n1/enmiendas', body: input });
  });

  it('los errores del servidor (409, 403) llegan a quien llama', async () => {
    installFakeApi(() => ({ status: 409, data: { success: false, message: 'Esa consulta ya tiene su nota.' } }));
    await expect(createNote('p1', { appointment_id: 'c1', diagnosis: 'x', treatment: null, notes: null })).rejects.toThrow();
  });
});

describe('lo escrito no se edita ni se borra', () => {
  it('el servicio no ofrece ninguna función para editar o borrar una nota', () => {
    const functions = Object.keys(expedientes).filter((key) => typeof (expedientes as Record<string, unknown>)[key] === 'function');
    expect(functions.sort()).toEqual(['amendNote', 'createNote', 'listPendingConsultations', 'listRecords']);
  });
});
