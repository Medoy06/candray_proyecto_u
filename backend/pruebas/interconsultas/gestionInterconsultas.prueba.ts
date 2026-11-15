// =============================================================================
// gestionInterconsultas.prueba.ts
// Qué prueba:   la API de interconsultas por HTTP: permisos por rol, quién puede
//               dar y revocar una interconsulta, a qué médicos se les puede dar,
//               la duración, y que lo que se da realmente abre (y al revocar o
//               vencer, cierra) el acceso al expediente.
// Cómo:         llama a la API real (supertest) sobre la base candray_test.
// Depende de:   app.ts y las ayudas de prueba.
// =============================================================================
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import { REFERRAL_DEFAULT_DAYS, REFERRAL_MAX_DAYS } from '../../src/configuracion/negocio';
import type { Role } from '../../src/configuracion/roles';
import { signToken } from '../../src/utilidades/token';
import { createTestPatient, insertAppointment, insertReferral } from '../ayudas/datosClinicos';
import { createTestBranch, createTestUser, type TestBranch } from '../ayudas/datosPrueba';

const app = createApp();

async function actor(role: Role, branchIds: string[] = []) {
  const user = await createTestUser({ role, branchIds });
  return { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
}
type Actor = Awaited<ReturnType<typeof actor>>;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const UUID_THAT_DOES_NOT_EXIST = '00000000-0000-0000-0000-000000000000';

let central: TestBranch;
let escalon: TestBranch;
let receptionist: Actor;
let dayCounter = 0;

beforeAll(async () => {
  central = await createTestBranch();
  escalon = await createTestBranch();
  receptionist = await actor('recepcionista', [central.id]);
});

// El médico "atiende" a un paciente cuando tiene una cita con él.
async function attend(doctor: Actor, patientId: string): Promise<void> {
  dayCounter += 1;
  const day = new Date(Date.UTC(2020, 0, 1 + dayCounter)).toISOString().slice(0, 10);
  await insertAppointment({
    patientId, doctorId: doctor.id, branchId: central.id, createdBy: receptionist.id, startsAt: `${day} 08:00`,
  });
}

// Un médico que atiende a un paciente nuevo, y otro médico que no.
async function scene() {
  const owner = await actor('doctor', [central.id, escalon.id]);
  const colleague = await actor('doctor', [escalon.id]);
  const patient = await createTestPatient();
  await attend(owner, patient.id);
  return { owner, colleague, patient };
}

const list = (patientId: string, token: string) =>
  request(app).get(`/api/pacientes/${patientId}/interconsultas`).set(auth(token));
const candidates = (patientId: string, token: string) =>
  request(app).get(`/api/pacientes/${patientId}/interconsultas/candidatos`).set(auth(token));
const grant = (patientId: string, token: string, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  request(app).post(`/api/pacientes/${patientId}/interconsultas`).set(auth(token)).set(headers).send(body);
const revoke = (patientId: string, referralId: string, token: string) =>
  request(app).post(`/api/pacientes/${patientId}/interconsultas/${referralId}/revocar`).set(auth(token));
const readRecord = (patientId: string, token: string) =>
  request(app).get(`/api/pacientes/${patientId}/expediente`).set(auth(token));

const auditRows = async (action: string, entityId: string) =>
  (await pool.query('SELECT * FROM audit_log WHERE action = $1 AND entity_id = $2', [action, entityId])).rows;

// -----------------------------------------------------------------------------
describe('permisos por rol', () => {
  it('sin token: 401', async () => {
    const id = UUID_THAT_DOES_NOT_EXIST;
    expect((await request(app).get(`/api/pacientes/${id}/interconsultas`)).status).toBe(401);
    expect((await request(app).post(`/api/pacientes/${id}/interconsultas`).send({})).status).toBe(401);
  });

  it.each(['recepcionista', 'encargado_venta', 'directivo'] as const)(
    '%s no puede ver, dar ni revocar interconsultas: lo frena la ruta (403)',
    async (role) => {
      const { colleague, patient } = await scene();
      const user = await actor(role, [central.id]);
      const denied = { status: 403, body: { message: 'No tiene permisos para realizar esta acción.' } };
      expect(await list(patient.id, user.token)).toMatchObject(denied);
      expect(await candidates(patient.id, user.token)).toMatchObject(denied);
      expect(await grant(patient.id, user.token, { provider_id: colleague.id, reason: 'Opinión' })).toMatchObject(denied);
      expect(await revoke(patient.id, UUID_THAT_DOES_NOT_EXIST, user.token)).toMatchObject(denied);
    },
  );

  it('el administrador (perfil demostración) puede ver las interconsultas, pero no darlas ni revocarlas', async () => {
    const { owner, colleague, patient } = await scene();
    const admin = await actor('admin');
    await insertReferral({ patientId: patient.id, providerId: colleague.id, grantedBy: owner.id });
    expect((await list(patient.id, admin.token)).body.data).toHaveLength(1);
    expect((await candidates(patient.id, admin.token)).status).toBe(403);
    expect((await grant(patient.id, admin.token, { provider_id: colleague.id, reason: 'Opinión' })).status).toBe(403);
  });

  it('no existe ruta para borrar una interconsulta', async () => {
    const { owner, patient } = await scene();
    const response = await request(app)
      .delete(`/api/pacientes/${patient.id}/interconsultas/${UUID_THAT_DOES_NOT_EXIST}`)
      .set(auth(owner.token));
    expect(response.status).toBe(404);
  });
});

// -----------------------------------------------------------------------------
describe('dar una interconsulta', () => {
  it('crea la interconsulta vigente, con el médico del token y el vencimiento que calcula el servidor', async () => {
    const { owner, colleague, patient } = await scene();
    const impostor = await actor('doctor', [central.id]);
    const response = await grant(patient.id, owner.token, {
      provider_id: colleague.id, reason: '  Segunda opinión  ', days: 7,
      granted_by: impostor.id, expires_at: '2099-01-01 00:00', patient_id: UUID_THAT_DOES_NOT_EXIST,
    });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      patient_id: patient.id, provider_id: colleague.id, granted_by: owner.id,
      reason: 'Segunda opinión', status: 'active', revoked_at: null, revoked_by: null,
      provider_name: 'Usuario de Prueba', granted_by_name: 'Usuario de Prueba',
    });
    // Vence 7 días después de crearse (no en 2099).
    const { rows } = await pool.query<{ days: number }>(
      `SELECT extract(epoch FROM (expires_at - created_at)) / 86400 AS days FROM referrals WHERE id = $1`,
      [response.body.data.id],
    );
    expect(Math.round(Number(rows[0].days))).toBe(7);
  });

  it(`sin "days" dura ${REFERRAL_DEFAULT_DAYS} días`, async () => {
    const { owner, colleague, patient } = await scene();
    const response = await grant(patient.id, owner.token, { provider_id: colleague.id, reason: 'Opinión' });
    const { rows } = await pool.query<{ days: number }>(
      `SELECT extract(epoch FROM (expires_at - created_at)) / 86400 AS days FROM referrals WHERE id = $1`,
      [response.body.data.id],
    );
    expect(Math.round(Number(rows[0].days))).toBe(REFERRAL_DEFAULT_DAYS);
  });

  it(`acepta el máximo de ${REFERRAL_MAX_DAYS} días`, async () => {
    const { owner, colleague, patient } = await scene();
    expect((await grant(patient.id, owner.token, { provider_id: colleague.id, reason: 'Opinión', days: REFERRAL_MAX_DAYS })).status).toBe(201);
  });

  it.each([
    ['sin médico', { provider_id: undefined, reason: 'Opinión' }],
    ['con un médico mal escrito', { provider_id: 'no-es-un-uuid', reason: 'Opinión' }],
    ['sin motivo', { reason: '' }],
    ['con un motivo muy corto', { reason: 'ab' }],
    ['con un motivo de solo espacios', { reason: '     ' }],
    ['con un motivo muy largo', { reason: 'x'.repeat(501) }],
    ['con 0 días', { reason: 'Opinión', days: 0 }],
    ['con más días que el máximo', { reason: 'Opinión', days: REFERRAL_MAX_DAYS + 1 }],
    ['con días con decimales', { reason: 'Opinión', days: 2.5 }],
    ['con días en texto', { reason: 'Opinión', days: '7' }],
  ])('rechaza la interconsulta %s (400)', async (_name, overrides) => {
    const { owner, colleague, patient } = await scene();
    const response = await grant(patient.id, owner.token, { provider_id: colleague.id, ...overrides });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Datos inválidos.'); // lo frena el esquema, no la base de datos
  });

  it('el médico destinatario debe existir, estar activo y ser médico (400)', async () => {
    const { owner, patient } = await scene();
    const inactive = await createTestUser({ role: 'doctor', branchIds: [central.id], isActive: false });
    const notDoctor = await actor('recepcionista', [central.id]);
    for (const providerId of [UUID_THAT_DOES_NOT_EXIST, inactive.id, notDoctor.id]) {
      const response = await grant(patient.id, owner.token, { provider_id: providerId, reason: 'Opinión' });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('El médico indicado no existe o no está activo.');
    }
  });

  it('no se puede dar una interconsulta a uno mismo (400)', async () => {
    const { owner, patient } = await scene();
    const response = await grant(patient.id, owner.token, { provider_id: owner.id, reason: 'Opinión' });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('No puede darse una interconsulta a sí mismo.');
  });

  it('un médico que ya atiende al paciente no la necesita (409)', async () => {
    const { owner, colleague, patient } = await scene();
    await attend(colleague, patient.id);
    const response = await grant(patient.id, owner.token, { provider_id: colleague.id, reason: 'Opinión' });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Ese médico ya atiende a este paciente: no necesita una interconsulta.');
  });

  it('si ya tiene una vigente, no se repite (409); si la anterior venció, sí se puede dar otra', async () => {
    const { owner, colleague, patient } = await scene();
    const first = await grant(patient.id, owner.token, { provider_id: colleague.id, reason: 'Opinión' });
    const repeated = await grant(patient.id, owner.token, { provider_id: colleague.id, reason: 'Otra vez' });
    expect(repeated.status).toBe(409);
    expect(repeated.body.message).toBe('Ese médico ya tiene una interconsulta vigente sobre este paciente.');

    await pool.query(
      `UPDATE referrals SET created_at = created_at - interval '40 days',
                            expires_at = (now() AT TIME ZONE 'America/El_Salvador') - interval '1 day'
        WHERE id = $1`,
      [first.body.data.id],
    );
    expect((await grant(patient.id, owner.token, { provider_id: colleague.id, reason: 'Otra vez' })).status).toBe(201);
  });

  it('quien solo recibió una interconsulta no la puede pasar a un tercero (403)', async () => {
    const { owner, colleague, patient } = await scene();
    const third = await actor('doctor', [central.id]);
    await insertReferral({ patientId: patient.id, providerId: colleague.id, grantedBy: owner.id });
    const response = await grant(patient.id, colleague.token, { provider_id: third.id, reason: 'Opinión' });
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Solo un médico que haya atendido al paciente puede administrar sus interconsultas.');
  });

  it('un médico sin relación con el paciente: 403 y se audita la negativa', async () => {
    const { colleague, patient } = await scene();
    const stranger = await actor('doctor', [central.id]);
    expect((await grant(patient.id, stranger.token, { provider_id: colleague.id, reason: 'Opinión' })).status).toBe(403);
    expect(await auditRows('record_access_denied', patient.id)).toHaveLength(1);
  });

  it('paciente inexistente: 404', async () => {
    const { owner, colleague } = await scene();
    expect((await grant(UUID_THAT_DOES_NOT_EXIST, owner.token, { provider_id: colleague.id, reason: 'Opinión' })).status).toBe(404);
  });

  it('queda en la bitácora con quién la dio y desde qué sucursal', async () => {
    const { owner, colleague, patient } = await scene();
    const response = await grant(patient.id, owner.token, { provider_id: colleague.id, reason: 'Opinión' }, { 'X-Sucursal-Id': escalon.id });
    const [row] = await auditRows('referral_granted', response.body.data.id);
    expect(row).toMatchObject({ entity_type: 'referral', actor_id: owner.id, branch_id: escalon.id });
    expect(row.detail).toEqual({
      patient_id: patient.id, provider_id: colleague.id, expires_at: response.body.data.expires_at,
    });
  });
});

// -----------------------------------------------------------------------------
describe('lo que la interconsulta abre y cierra', () => {
  it('antes: sin acceso; al darla: lectura del expediente; al revocarla: otra vez sin acceso', async () => {
    const { owner, colleague, patient } = await scene();
    expect((await readRecord(patient.id, colleague.token)).status).toBe(403);

    const given = await grant(patient.id, owner.token, { provider_id: colleague.id, reason: 'Opinión' });
    const open = await readRecord(patient.id, colleague.token);
    expect(open.status).toBe(200);
    expect(open.body.access).toMatchObject({ reason: 'referral' });

    expect((await revoke(patient.id, given.body.data.id, owner.token)).status).toBe(200);
    expect((await readRecord(patient.id, colleague.token)).status).toBe(403);
  });

  it('al vencer, cierra el acceso', async () => {
    const { owner, colleague, patient } = await scene();
    const given = await grant(patient.id, owner.token, { provider_id: colleague.id, reason: 'Opinión' });
    await pool.query(
      `UPDATE referrals SET created_at = created_at - interval '40 days',
                            expires_at = (now() AT TIME ZONE 'America/El_Salvador') - interval '1 minute'
        WHERE id = $1`,
      [given.body.data.id],
    );
    expect((await readRecord(patient.id, colleague.token)).status).toBe(403);
  });
});

// -----------------------------------------------------------------------------
describe('revocar', () => {
  it('la revoca, deja quién y cuándo, y queda en la bitácora', async () => {
    const { owner, colleague, patient } = await scene();
    const given = await grant(patient.id, owner.token, { provider_id: colleague.id, reason: 'Opinión' });
    const response = await revoke(patient.id, given.body.data.id, owner.token);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'revoked', revoked_by: owner.id });
    expect(response.body.data.revoked_at).toMatch(/^\d{4}-\d{2}-\d{2} /);
    const [row] = await auditRows('referral_revoked', given.body.data.id);
    expect(row).toMatchObject({ actor_id: owner.id });
    expect(row.detail).toEqual({ patient_id: patient.id, provider_id: colleague.id });
  });

  it('solo la revoca quien la dio (403), aunque otro médico también haya atendido al paciente', async () => {
    const { owner, colleague, patient } = await scene();
    const other = await actor('doctor', [central.id]);
    await attend(other, patient.id);
    const given = await grant(patient.id, owner.token, { provider_id: colleague.id, reason: 'Opinión' });
    const response = await revoke(patient.id, given.body.data.id, other.token);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Solo el médico que dio la interconsulta puede revocarla.');
    expect((await list(patient.id, owner.token)).body.data[0].status).toBe('active');
  });

  it('el médico que recibió la interconsulta no puede revocarla (403)', async () => {
    const { owner, colleague, patient } = await scene();
    const given = await grant(patient.id, owner.token, { provider_id: colleague.id, reason: 'Opinión' });
    expect((await revoke(patient.id, given.body.data.id, colleague.token)).status).toBe(403);
  });

  it('una ya revocada o ya vencida no se puede revocar de nuevo (409)', async () => {
    const { owner, colleague, patient } = await scene();
    const given = await grant(patient.id, owner.token, { provider_id: colleague.id, reason: 'Opinión' });
    await revoke(patient.id, given.body.data.id, owner.token);
    const again = await revoke(patient.id, given.body.data.id, owner.token);
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('Esa interconsulta ya no está vigente.');

    const expired = (await insertReferral({ patientId: patient.id, providerId: colleague.id, grantedBy: owner.id })).rows[0].id;
    await pool.query(
      `UPDATE referrals SET created_at = created_at - interval '40 days',
                            expires_at = (now() AT TIME ZONE 'America/El_Salvador') - interval '1 day'
        WHERE id = $1`,
      [expired],
    );
    expect((await revoke(patient.id, expired, owner.token)).status).toBe(409);
  });

  it('dos revocaciones a la vez: una gana y la otra recibe 409', async () => {
    const { owner, colleague, patient } = await scene();
    const given = await grant(patient.id, owner.token, { provider_id: colleague.id, reason: 'Opinión' });
    const results = await Promise.all([1, 2, 3].map(() => revoke(patient.id, given.body.data.id, owner.token)));
    expect(results.map((result) => result.status).sort()).toEqual([200, 409, 409]);
  });

  it('una interconsulta de OTRO paciente o que no existe: 404', async () => {
    const { owner, patient } = await scene();
    const other = await scene();
    const foreign = await grant(other.patient.id, other.owner.token, { provider_id: other.colleague.id, reason: 'Opinión' });
    // El médico tiene acceso a SU paciente, pero la interconsulta es de otro: no se puede revocar por esta vía.
    expect((await revoke(patient.id, foreign.body.data.id, owner.token)).status).toBe(404);
    expect((await revoke(patient.id, UUID_THAT_DOES_NOT_EXIST, owner.token)).status).toBe(404);
    expect((await revoke(patient.id, 'no-es-un-uuid', owner.token)).status).toBe(400);
  });
});

// -----------------------------------------------------------------------------
describe('ver las interconsultas de un paciente', () => {
  it('lista vigentes, vencidas y revocadas, la más reciente primero, con su estado', async () => {
    const { owner, patient } = await scene();
    const [a, b, c] = await Promise.all([actor('doctor', [central.id]), actor('doctor', [central.id]), actor('doctor', [central.id])]);
    const revoked = (await insertReferral({ patientId: patient.id, providerId: a.id, grantedBy: owner.id })).rows[0].id;
    await pool.query('UPDATE referrals SET revoked_at = now(), revoked_by = $2 WHERE id = $1', [revoked, owner.id]);
    const expired = (await insertReferral({ patientId: patient.id, providerId: b.id, grantedBy: owner.id })).rows[0].id;
    await pool.query(
      `UPDATE referrals SET created_at = created_at - interval '40 days',
                            expires_at = (now() AT TIME ZONE 'America/El_Salvador') - interval '1 day'
        WHERE id = $1`,
      [expired],
    );
    const active = (await insertReferral({ patientId: patient.id, providerId: c.id, grantedBy: owner.id })).rows[0].id;

    const response = await list(patient.id, owner.token);
    expect(response.status).toBe(200);
    const byId = Object.fromEntries(response.body.data.map((row: { id: string; status: string }) => [row.id, row.status]));
    expect(byId).toEqual({ [revoked]: 'revoked', [expired]: 'expired', [active]: 'active' });
    // La vencida se creó hace 40 días: queda al final; la más reciente (vigente) primero.
    expect(response.body.data[0].id).toBe(active);
    expect(response.body.data[2].id).toBe(expired);
  });

  it('solo las de ese paciente', async () => {
    const { owner, colleague, patient } = await scene();
    const other = await scene();
    await insertReferral({ patientId: patient.id, providerId: colleague.id, grantedBy: owner.id });
    await insertReferral({ patientId: other.patient.id, providerId: other.colleague.id, grantedBy: other.owner.id });
    expect((await list(patient.id, owner.token)).body.data).toHaveLength(1);
  });

  it('quien solo recibió una interconsulta no ve quién más tiene acceso (403)', async () => {
    const { owner, colleague, patient } = await scene();
    await insertReferral({ patientId: patient.id, providerId: colleague.id, grantedBy: owner.id });
    expect((await list(patient.id, colleague.token)).status).toBe(403);
  });

  it('paciente inexistente: 404; identificador mal escrito: 400', async () => {
    const { owner } = await scene();
    expect((await list(UUID_THAT_DOES_NOT_EXIST, owner.token)).status).toBe(404);
    expect((await list('no-es-un-uuid', owner.token)).status).toBe(400);
  });
});

// -----------------------------------------------------------------------------
describe('candidatos', () => {
  it('ofrece médicos activos que no atienden al paciente, sin quien pregunta, y excluye a los que ya tienen acceso', async () => {
    const { owner, colleague, patient } = await scene();
    const attending = await actor('doctor', [central.id]);
    await attend(attending, patient.id);
    const withReferral = await actor('doctor', [central.id]);
    await insertReferral({ patientId: patient.id, providerId: withReferral.id, grantedBy: owner.id });
    const inactive = await createTestUser({ role: 'doctor', branchIds: [central.id], isActive: false });

    const ids = (await candidates(patient.id, owner.token)).body.data.map((row: { id: string }) => row.id);
    expect(ids).toContain(colleague.id);
    expect(ids).not.toContain(owner.id);
    expect(ids).not.toContain(attending.id);
    expect(ids).not.toContain(withReferral.id);
    expect(ids).not.toContain(inactive.id);
    expect(ids).not.toContain(receptionist.id);
  });

  it('un médico cuya cita con el paciente fue cancelada sí es candidato', async () => {
    const { owner, patient } = await scene();
    const cancelled = await actor('doctor', [central.id]);
    dayCounter += 1;
    const day = new Date(Date.UTC(2020, 0, 1 + dayCounter)).toISOString().slice(0, 10);
    await insertAppointment({
      patientId: patient.id, doctorId: cancelled.id, branchId: central.id, createdBy: receptionist.id,
      startsAt: `${day} 08:00`, status: 'cancelled', cancellationReason: 'Cancelada',
    });
    const ids = (await candidates(patient.id, owner.token)).body.data.map((row: { id: string }) => row.id);
    expect(ids).toContain(cancelled.id);
  });

  it('un médico con una interconsulta revocada (aún sin vencer) vuelve a ser candidato', async () => {
    const { owner, colleague, patient } = await scene();
    const given = await grant(patient.id, owner.token, { provider_id: colleague.id, reason: 'Opinión' });
    const before = (await candidates(patient.id, owner.token)).body.data.map((row: { id: string }) => row.id);
    expect(before).not.toContain(colleague.id);
    await revoke(patient.id, given.body.data.id, owner.token);
    const after = (await candidates(patient.id, owner.token)).body.data.map((row: { id: string }) => row.id);
    expect(after).toContain(colleague.id);
  });

  it('quien solo recibió una interconsulta no ve candidatos (403)', async () => {
    const { owner, colleague, patient } = await scene();
    await insertReferral({ patientId: patient.id, providerId: colleague.id, grantedBy: owner.id });
    expect((await candidates(patient.id, colleague.token)).status).toBe(403);
  });
});
