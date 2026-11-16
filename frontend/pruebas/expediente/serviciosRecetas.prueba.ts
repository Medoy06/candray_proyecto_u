// =============================================================================
// serviciosRecetas.prueba.ts
// Qué prueba:   las llamadas a la API de recetas: a qué dirección van, con qué
//               cuerpo, y que no existan llamadas para editar ni borrar.
// =============================================================================
import { describe, expect, it } from 'vitest';
import * as servicio from '../../src/servicios/recetas';
import { installFakeApi } from '../ayudas/apiFalsa';

const MEASURES = {
  od_sphere: -1.5, od_cylinder: null, od_axis: null, od_addition: null,
  oi_sphere: null, oi_cylinder: null, oi_axis: null, oi_addition: null,
  pupillary_distance: null, lens_notes: null,
};

describe('servicios/recetas', () => {
  it('listPrescriptions pide GET /pacientes/:id/recetas y devuelve filas y motivo de acceso', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [{ id: 'r1' }], access: 'appointment' } }));
    const list = await servicio.listPrescriptions('p1');
    expect(received).toMatchObject([{ method: 'get', url: '/pacientes/p1/recetas' }]);
    expect(list).toEqual({ rows: [{ id: 'r1' }], access: 'appointment' });
  });

  it('issuePrescription hace POST /pacientes/:id/recetas con la nota y las medidas', async () => {
    const received = installFakeApi(() => ({ status: 201, data: { data: { id: 'r2' } } }));
    const created = await servicio.issuePrescription('p1', { record_id: 'n1', ...MEASURES });
    expect(received).toMatchObject([{ method: 'post', url: '/pacientes/p1/recetas', body: { record_id: 'n1', od_sphere: -1.5 } }]);
    expect(created).toEqual({ id: 'r2' });
  });

  it('replacePrescription hace POST /pacientes/:id/recetas/:receta/reemplazos solo con las medidas', async () => {
    const received = installFakeApi(() => ({ status: 201, data: { data: { id: 'r3' } } }));
    const created = await servicio.replacePrescription('p1', 'r1', MEASURES);
    expect(received).toMatchObject([{ method: 'post', url: '/pacientes/p1/recetas/r1/reemplazos', body: MEASURES }]);
    expect(received[0].body).not.toHaveProperty('record_id');
    expect(created).toEqual({ id: 'r3' });
  });

  it('listOpticalPrescriptions pide la misma dirección y devuelve el motivo de acceso "consent"', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [{ id: 'r1' }], access: 'consent' } }));
    const list = await servicio.listOpticalPrescriptions('p1');
    expect(received).toMatchObject([{ method: 'get', url: '/pacientes/p1/recetas' }]);
    expect(list).toEqual({ rows: [{ id: 'r1' }], access: 'consent' });
  });

  it('no hay llamadas para editar ni borrar una receta', () => {
    expect(Object.keys(servicio).sort()).toEqual([
      'issuePrescription', 'listOpticalPrescriptions', 'listPrescriptions', 'replacePrescription',
    ]);
  });
});
