// =============================================================================
// serviciosPacientes.prueba.ts
// Qué prueba:   que listPatients, createPatient y updatePatient envíen al
//               servidor la ruta, el método, los parámetros y el cuerpo
//               correctos, y que devuelvan lo que corresponde.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { createPatient, listPatients, PATIENT_PAGE_SIZE, updatePatient } from '../../src/servicios/pacientes';
import { installFakeApi } from '../ayudas/apiFalsa';

const PAGINATION = { page: 2, page_size: 25, total: 30, total_pages: 2 };

describe('listPatients', () => {
  it('sin búsqueda solo envía la página y el tamaño', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [], pagination: PAGINATION } }));
    await listPatients({ search: '', includeInactive: false }, 1);
    expect(received[0]).toMatchObject({ method: 'get', url: '/pacientes', params: { page: 1, page_size: PATIENT_PAGE_SIZE } });
    expect(received[0].params).not.toHaveProperty('q');
    expect(received[0].params).not.toHaveProperty('include_inactive');
  });

  it('con búsqueda y desactivados envía q e include_inactive', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [], pagination: PAGINATION } }));
    await listPatients({ search: 'ana', includeInactive: true }, 3);
    expect(received[0].params).toEqual({ page: 3, page_size: PATIENT_PAGE_SIZE, q: 'ana', include_inactive: 'true' });
  });

  it('devuelve las filas y la paginación', async () => {
    installFakeApi(() => ({ status: 200, data: { data: [{ id: 'p1' }], pagination: PAGINATION } }));
    expect(await listPatients({ search: '', includeInactive: false }, 2)).toEqual({
      rows: [{ id: 'p1' }],
      pagination: PAGINATION,
    });
  });
});

describe('createPatient y updatePatient', () => {
  it('createPatient hace POST a /pacientes con el cuerpo y devuelve el paciente', async () => {
    const received = installFakeApi(() => ({ status: 201, data: { data: { id: 'n1' } } }));
    const input = { full_name: 'Ana Pérez', birth_date: '1990-05-20', phone: '7000-1111', dui: null, email: null };
    expect(await createPatient(input)).toEqual({ id: 'n1' });
    expect(received[0]).toMatchObject({ method: 'post', url: '/pacientes', body: input });
  });

  it('updatePatient hace PATCH a /pacientes/:id solo con lo enviado', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: { id: 'p9' } } }));
    expect(await updatePatient('p9', { is_active: false })).toEqual({ id: 'p9' });
    expect(received[0]).toMatchObject({ method: 'patch', url: '/pacientes/p9', body: { is_active: false } });
  });
});
