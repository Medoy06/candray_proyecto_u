// =============================================================================
// gestionConsentimientos.prueba.ts
// Qué prueba:   la API de consentimientos por HTTP: permisos por rol (incluida
//               la óptica, que solo ve sí/no), registrar y revocar, un solo
//               consentimiento vigente por paciente, pacientes inexistentes o
//               inactivos, y la constancia en la bitácora.
// Cómo:         llama a la API real (supertest) sobre la base candray_test.
// Depende de:   app.ts y las ayudas de prueba.
// =============================================================================
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import type { Role } from '../../src/configuracion/roles';
import { signToken } from '../../src/utilidades/token';
import { createTestPatient, insertConsent } from '../ayudas/datosClinicos';
import { createTestBranch, createTestUser, type TestBranch } from '../ayudas/datosPrueba';

const app = createApp();

async function actor(role: Role, branchIds: string[] = []) {
  const user = await createTestUser({ role, branchIds });
  return { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const UUID_THAT_DOES_NOT_EXIST = '00000000-0000-0000-0000-000000000000';

let central: TestBranch;
let escalon: TestBranch;

beforeAll(async () => {
  central = await createTestBranch();
  escalon = await createTestBranch();
});

const list = (patientId: string, token: string) =>
  request(app).get(`/api/pacientes/${patientId}/consentimientos`).set(auth(token));
const status = (patientId: string, token: string) =>
  request(app).get(`/api/pacientes/${patientId}/consentimientos/estado`).set(auth(token));
const grant = (patientId: string, token: string, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  request(app).post(`/api/pacientes/${patientId}/consentimientos`).set(auth(token)).set(headers).send(body);
const revoke = (patientId: string, consentId: string, token: string) =>
  request(app).post(`/api/pacientes/${patientId}/consentimientos/${consentId}/revocar`).set(auth(token));

const auditRows = async (action: string, entityId: string) =>
  (await pool.query('SELECT * FROM audit_log WHERE action = $1 AND entity_id = $2', [action, entityId])).rows;

// -----------------------------------------------------------------------------
describe('permisos por rol', () => {
  it('sin token: 401 en las cuatro rutas', async () => {
    const patient = await createTestPatient();
    const base = `/api/pacientes/${patient.id}/consentimientos`;
    expect((await request(app).get(base)).status).toBe(401);
    expect((await request(app).get(`${base}/estado`)).status).toBe(401);
    expect((await request(app).post(base).send({})).status).toBe(401);
    expect((await request(app).post(`${base}/${UUID_THAT_DOES_NOT_EXIST}/revocar`)).status).toBe(401);
  });

  it.each(['doctor', 'recepcionista', 'admin'] as const)('%s puede registrar, ver el historial y consultar el estado', async (role) => {
    const patient = await createTestPatient();
    const user = await actor(role, role === 'admin' ? [] : [central.id]);
    const created = await grant(patient.id, user.token);
    expect(created.status).toBe(201);
    expect((await list(patient.id, user.token)).status).toBe(200);
    expect((await status(patient.id, user.token)).body.data).toEqual({ granted: true });
    expect((await revoke(patient.id, created.body.data.id, user.token)).status).toBe(200);
  });

  it.each(['encargado_venta', 'directivo'] as const)('%s no puede registrar, listar ni revocar (403)', async (role) => {
    const patient = await createTestPatient();
    const user = await actor(role, [central.id]);
    const consent = (await insertConsent({ patientId: patient.id, grantedBy: user.id })).rows[0].id;
    for (const response of [await grant(patient.id, user.token), await list(patient.id, user.token), await revoke(patient.id, consent, user.token)]) {
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('No tiene permisos para realizar esta acción.');
    }
    expect((await auditRows('consent_granted', consent))).toHaveLength(0);
  });

  it('la óptica sí puede preguntar el estado, y solo recibe sí o no (sin quién ni la nota)', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id]);
    await insertConsent({ patientId: patient.id, grantedBy: staff.id, note: 'Dato interno' });
    const optical = await actor('encargado_venta', [central.id]);
    const response = await status(patient.id, optical.token);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ granted: true });
    expect(JSON.stringify(response.body)).not.toContain('Dato interno');
  });

  it('el directivo no puede ni preguntar el estado (403)', async () => {
    const patient = await createTestPatient();
    const boss = await actor('directivo', [central.id]);
    expect((await status(patient.id, boss.token)).status).toBe(403);
  });
});

// -----------------------------------------------------------------------------
describe('estado', () => {
  it('sin consentimiento: granted false; con uno vigente: true; revocado: false otra vez', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id]);
    expect((await status(patient.id, staff.token)).body.data).toEqual({ granted: false });
    const id = (await grant(patient.id, staff.token)).body.data.id;
    expect((await status(patient.id, staff.token)).body.data).toEqual({ granted: true });
    await revoke(patient.id, id, staff.token);
    expect((await status(patient.id, staff.token)).body.data).toEqual({ granted: false });
  });

  it('es por paciente: el consentimiento de uno no vale para otro', async () => {
    const [a, b] = [await createTestPatient(), await createTestPatient()];
    const staff = await actor('recepcionista', [central.id]);
    await grant(a.id, staff.token);
    expect((await status(b.id, staff.token)).body.data).toEqual({ granted: false });
  });

  it('paciente inexistente: 404; identificador mal escrito: 400', async () => {
    const staff = await actor('recepcionista', [central.id]);
    expect((await status(UUID_THAT_DOES_NOT_EXIST, staff.token)).status).toBe(404);
    expect((await status('no-es-un-uuid', staff.token)).status).toBe(400);
  });
});

// -----------------------------------------------------------------------------
describe('registrar', () => {
  it('guarda quién lo registró (del token) y la nota, y responde 201 con el consentimiento', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id]);
    const response = await grant(patient.id, staff.token, { note: '  Firmó el formulario en recepción  ' });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      patient_id: patient.id, granted_by: staff.id, granted_by_name: expect.stringMatching(/\S/), note: 'Firmó el formulario en recepción',
      status: 'active', revoked_at: null, revoked_by: null, revoked_by_name: null,
    });
  });

  it('sin cuerpo, con nota vacía o con espacios: se guarda sin nota (null)', async () => {
    const staff = await actor('recepcionista', [central.id]);
    for (const body of [{}, { note: '' }, { note: '   ' }, { note: null }]) {
      const patient = await createTestPatient();
      const response = await grant(patient.id, staff.token, body);
      expect(response.status).toBe(201);
      expect(response.body.data.note).toBeNull();
    }
  });

  it('no se puede decir quién lo registró desde el cuerpo', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id]);
    const someoneElse = await actor('doctor', [central.id]);
    const response = await grant(patient.id, staff.token, { granted_by: someoneElse.id });
    expect(response.body.data.granted_by).toBe(staff.id);
  });

  it('una nota de más de 200 caracteres: 400', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id]);
    expect((await grant(patient.id, staff.token, { note: 'x'.repeat(201) })).status).toBe(400);
    expect((await grant(patient.id, staff.token, { note: 'x'.repeat(200) })).status).toBe(201);
  });

  it('un segundo consentimiento mientras hay uno vigente: 409', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id]);
    expect((await grant(patient.id, staff.token)).status).toBe(201);
    const second = await grant(patient.id, staff.token);
    expect(second.status).toBe(409);
    expect(second.body.message).toBe('Este paciente ya tiene un consentimiento vigente.');
  });

  it('después de revocar se puede registrar uno nuevo', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id]);
    const first = (await grant(patient.id, staff.token)).body.data.id;
    await revoke(patient.id, first, staff.token);
    expect((await grant(patient.id, staff.token)).status).toBe(201);
  });

  it('dos registros simultáneos: solo uno gana (el otro es 409)', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id]);
    const results = await Promise.all([grant(patient.id, staff.token), grant(patient.id, staff.token)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('paciente inexistente: 404', async () => {
    const staff = await actor('recepcionista', [central.id]);
    expect((await grant(UUID_THAT_DOES_NOT_EXIST, staff.token)).status).toBe(404);
  });

  it('un paciente inactivo no recibe consentimiento nuevo (409), pero se puede revocar el que ya tenía', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id]);
    const id = (await grant(patient.id, staff.token)).body.data.id;
    await pool.query('UPDATE patients SET is_active = false WHERE id = $1', [patient.id]);
    const other = await createTestPatient();
    await pool.query('UPDATE patients SET is_active = false WHERE id = $1', [other.id]);
    const blocked = await grant(other.id, staff.token);
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toBe('No se puede registrar un consentimiento de un paciente inactivo.');
    expect((await revoke(patient.id, id, staff.token)).status).toBe(200);
  });
});

// -----------------------------------------------------------------------------
describe('historial', () => {
  it('lista vigente y revocados, el más reciente primero, con los nombres', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id]);
    const doctor = await actor('doctor', [central.id]);
    const first = (await grant(patient.id, staff.token, { note: 'Primera vez' })).body.data.id;
    await revoke(patient.id, first, doctor.token);
    await grant(patient.id, staff.token, { note: 'Segunda vez' });
    const response = await list(patient.id, doctor.token);
    expect(response.status).toBe(200);
    expect(response.body.data.map((c: { note: string; status: string }) => [c.note, c.status])).toEqual([
      ['Segunda vez', 'active'],
      ['Primera vez', 'revoked'],
    ]);
    expect(response.body.data[1]).toMatchObject({ revoked_by: doctor.id, revoked_by_name: expect.stringMatching(/\S/) });
  });

  it('no mezcla consentimientos de otros pacientes', async () => {
    const [a, b] = [await createTestPatient(), await createTestPatient()];
    const staff = await actor('recepcionista', [central.id]);
    await grant(a.id, staff.token);
    expect((await list(b.id, staff.token)).body.data).toEqual([]);
  });

  it('paciente inexistente: 404', async () => {
    const staff = await actor('recepcionista', [central.id]);
    expect((await list(UUID_THAT_DOES_NOT_EXIST, staff.token)).status).toBe(404);
  });
});

// -----------------------------------------------------------------------------
describe('revocar', () => {
  it('cualquier persona con consents_manage puede revocarlo y queda quién lo hizo', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id]);
    const doctor = await actor('doctor', [central.id]);
    const id = (await grant(patient.id, staff.token)).body.data.id;
    const response = await revoke(patient.id, id, doctor.token);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'revoked', revoked_by: doctor.id, granted_by: staff.id });
    expect(response.body.data.revoked_at).not.toBeNull();
  });

  it('revocarlo dos veces: la segunda es 409 y no cambia quién lo revocó', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id]);
    const doctor = await actor('doctor', [central.id]);
    const id = (await grant(patient.id, staff.token)).body.data.id;
    await revoke(patient.id, id, doctor.token);
    const again = await revoke(patient.id, id, staff.token);
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('Ese consentimiento ya fue revocado.');
    expect((await list(patient.id, staff.token)).body.data[0].revoked_by).toBe(doctor.id);
  });

  it('dos revocaciones simultáneas: solo una gana', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id]);
    const id = (await grant(patient.id, staff.token)).body.data.id;
    const results = await Promise.all([revoke(patient.id, id, staff.token), revoke(patient.id, id, staff.token)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('un consentimiento de otro paciente o inexistente: 404, y el de otro paciente no se toca', async () => {
    const [a, b] = [await createTestPatient(), await createTestPatient()];
    const staff = await actor('recepcionista', [central.id]);
    const id = (await grant(a.id, staff.token)).body.data.id;
    expect((await revoke(b.id, id, staff.token)).status).toBe(404);
    expect((await revoke(a.id, UUID_THAT_DOES_NOT_EXIST, staff.token)).status).toBe(404);
    expect((await status(a.id, staff.token)).body.data).toEqual({ granted: true });
  });

  it('paciente inexistente: 404', async () => {
    const staff = await actor('recepcionista', [central.id]);
    expect((await revoke(UUID_THAT_DOES_NOT_EXIST, UUID_THAT_DOES_NOT_EXIST, staff.token)).status).toBe(404);
  });
});

// -----------------------------------------------------------------------------
describe('bitácora', () => {
  it('registrar queda anotado con quién, sucursal y paciente', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id, escalon.id]);
    const id = (await grant(patient.id, staff.token, {}, { 'X-Sucursal-Id': escalon.id })).body.data.id;
    const [row] = await auditRows('consent_granted', id);
    expect(row).toMatchObject({ entity_type: 'consent', actor_id: staff.id, branch_id: escalon.id });
    expect(row.detail).toEqual({ patient_id: patient.id });
  });

  it('revocar queda anotado, y un intento rechazado (409) no deja una segunda anotación', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id]);
    const id = (await grant(patient.id, staff.token)).body.data.id;
    await revoke(patient.id, id, staff.token);
    await revoke(patient.id, id, staff.token);
    const rows = await auditRows('consent_revoked', id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity_type: 'consent', actor_id: staff.id, branch_id: central.id });
    expect(rows[0].detail).toEqual({ patient_id: patient.id });
  });

  it('un registro rechazado (409) no deja anotación de registro', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id]);
    const id = (await grant(patient.id, staff.token)).body.data.id;
    await grant(patient.id, staff.token);
    expect(await auditRows('consent_granted', id)).toHaveLength(1);
  });
});
