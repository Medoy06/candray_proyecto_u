// =============================================================================
// gestionExpedientes.prueba.ts
// Qué prueba:   la API del expediente clínico por HTTP:
//                 - permisos por rol y la regla de acceso al paciente (RF-08,
//                   RB-04): cita o interconsulta vigente, desde cualquier sucursal;
//                 - falla cerrada: si la verificación falla, se niega y se audita;
//                 - RF-09: cada lectura y cada negativa quedan en la bitácora;
//                 - escribir la nota de una consulta y sus condiciones;
//                 - enmiendas (RB-03): se agrega, nunca se edita ni se borra.
// Cómo:         llama a la API real (supertest) sobre la base candray_test.
// Depende de:   app.ts y las ayudas de prueba.
// =============================================================================
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import type { Role } from '../../src/configuracion/roles';
import * as auditModel from '../../src/modelos/auditoria';
import * as recordsModel from '../../src/modelos/expedientes';
import { requirePatientAccess } from '../../src/servicios/accesoPaciente';
import { signToken } from '../../src/utilidades/token';
import {
  createTestPatient,
  insertAppointment,
  insertMedicalRecord,
  insertReferral,
} from '../ayudas/datosClinicos';
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
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Una fecha pasada distinta para cada cita, para que no choquen las horas.
function nextPastDay(): string {
  dayCounter += 1;
  const date = new Date(Date.UTC(2020, 0, 1 + dayCounter));
  return date.toISOString().slice(0, 10);
}

// Crea una cita entre un médico y un paciente (por defecto, pasada y agendada).
async function appointmentOf(
  doctor: Actor,
  patientId: string,
  options: { status?: 'scheduled' | 'completed' | 'cancelled' | 'no_show'; day?: string; time?: string } = {},
): Promise<string> {
  const result = await insertAppointment({
    patientId,
    doctorId: doctor.id,
    branchId: central.id,
    createdBy: receptionist.id,
    startsAt: `${options.day ?? nextPastDay()} ${options.time ?? '08:00'}`,
    status: options.status ?? 'scheduled',
    cancellationReason: options.status === 'cancelled' ? 'Cancelada en la prueba' : null,
  });
  return result.rows[0].id;
}

// Un médico (en las dos sucursales) con una cita con un paciente nuevo.
async function scene(options: { status?: 'scheduled' | 'completed' | 'cancelled' | 'no_show' } = {}) {
  const doctor = await actor('doctor', [central.id, escalon.id]);
  const patient = await createTestPatient();
  const appointmentId = await appointmentOf(doctor, patient.id, options);
  return { doctor, patient, appointmentId };
}

const history = (patientId: string, token: string, query = '', headers: Record<string, string> = {}) =>
  request(app).get(`/api/pacientes/${patientId}/expediente${query}`).set(auth(token)).set(headers);
const writeNote = (patientId: string, token: string, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  request(app).post(`/api/pacientes/${patientId}/expediente`).set(auth(token)).set(headers).send(body);
const amend = (patientId: string, recordId: string, token: string, body: Record<string, unknown>) =>
  request(app).post(`/api/pacientes/${patientId}/expediente/${recordId}/enmiendas`).set(auth(token)).send(body);

const auditRows = async (action: string, entityId: string) =>
  (await pool.query('SELECT * FROM audit_log WHERE action = $1 AND entity_id = $2', [action, entityId])).rows;

// -----------------------------------------------------------------------------
describe('permisos por rol', () => {
  it('sin token: 401 en las tres rutas', async () => {
    const id = UUID_THAT_DOES_NOT_EXIST;
    expect((await request(app).get(`/api/pacientes/${id}/expediente`)).status).toBe(401);
    expect((await request(app).post(`/api/pacientes/${id}/expediente`).send({})).status).toBe(401);
    expect((await request(app).post(`/api/pacientes/${id}/expediente/${id}/enmiendas`).send({})).status).toBe(401);
  });

  it.each(['recepcionista', 'encargado_venta', 'directivo'] as const)(
    'RF-08: %s no puede leer, escribir ni enmendar el expediente (403)',
    async (role) => {
      const { patient, appointmentId } = await scene();
      const user = await actor(role, [central.id]);
      const body = { appointment_id: appointmentId, diagnosis: 'x' };
      // El mensaje distingue la primera barrera (la ruta, por capacidad) de las del servicio.
      const denied = { status: 403, body: { message: 'No tiene permisos para realizar esta acción.' } };
      expect(await history(patient.id, user.token)).toMatchObject(denied);
      expect(await writeNote(patient.id, user.token, body)).toMatchObject(denied);
      expect(await amend(patient.id, UUID_THAT_DOES_NOT_EXIST, user.token, { diagnosis: 'x' })).toMatchObject(denied);
    },
  );

  it('el administrador (perfil demostración) puede leer, pero no escribe: la nota es del médico', async () => {
    const { patient, appointmentId } = await scene();
    const admin = await actor('admin');
    const read = await history(patient.id, admin.token);
    expect(read.status).toBe(200);
    expect(read.body.access).toEqual({ reason: 'role' });
    const write = await writeNote(patient.id, admin.token, { appointment_id: appointmentId, diagnosis: 'x' });
    expect(write.status).toBe(403);
    expect(write.body.message).toBe('Solo el médico que atendió la consulta puede escribir en el expediente.');
  });

  it('no existen rutas para editar ni borrar una nota', async () => {
    const { doctor, patient } = await scene();
    const record = `/api/pacientes/${patient.id}/expediente/${UUID_THAT_DOES_NOT_EXIST}`;
    for (const method of ['put', 'patch', 'delete'] as const) {
      expect((await request(app)[method](record).set(auth(doctor.token)).send({})).status).toBe(404);
    }
  });
});

// -----------------------------------------------------------------------------
describe('historial: quién puede abrir un expediente (RF-08, RB-04)', () => {
  it.each(['scheduled', 'completed', 'no_show'] as const)(
    'un médico con una cita %s con el paciente entra',
    async (status) => {
      const { doctor, patient } = await scene({ status });
      const response = await history(patient.id, doctor.token);
      expect(response.status).toBe(200);
      expect(response.body.access).toEqual({ reason: 'appointment' });
    },
  );

  it('un médico cuya única cita con el paciente fue cancelada NO entra', async () => {
    const { doctor, patient } = await scene({ status: 'cancelled' });
    expect((await history(patient.id, doctor.token)).status).toBe(403);
  });

  it('un médico sin relación con el paciente no entra, y se audita la negativa', async () => {
    const { patient } = await scene();
    const stranger = await actor('doctor', [escalon.id]);
    const response = await history(patient.id, stranger.token, '', { 'X-Sucursal-Id': escalon.id });
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('No tiene acceso al expediente de este paciente.');
    expect(response.body.data).toBeUndefined();

    const [row] = await auditRows('record_access_denied', patient.id);
    expect(row).toMatchObject({ entity_type: 'patient', actor_id: stranger.id, branch_id: escalon.id });
    expect(row.detail).toEqual({ reason: 'no_relation' });
  });

  it('una cita de OTRO médico con el paciente no le da acceso a este', async () => {
    const { patient } = await scene();
    const other = await actor('doctor', [central.id]);
    expect((await history(patient.id, other.token)).status).toBe(403);
  });

  it('una interconsulta vigente da acceso de lectura, con su fecha de vencimiento', async () => {
    const { doctor, patient } = await scene();
    const guest = await actor('doctor', [central.id]);
    await insertReferral({ patientId: patient.id, providerId: guest.id, grantedBy: doctor.id, expiresAt: '2099-01-01 12:00' });
    const response = await history(patient.id, guest.token);
    expect(response.status).toBe(200);
    expect(response.body.access).toEqual({ reason: 'referral', expiresAt: '2099-01-01 12:00:00' });
  });

  it('una interconsulta vencida ya no da acceso', async () => {
    const { doctor, patient } = await scene();
    const guest = await actor('doctor', [central.id]);
    // La base exige que expire después de crearse: se crea vigente y se vence a mano.
    const id = (await insertReferral({ patientId: patient.id, providerId: guest.id, grantedBy: doctor.id })).rows[0].id;
    await pool.query(
      `UPDATE referrals SET created_at = created_at - interval '2 days',
                            expires_at = (now() AT TIME ZONE 'America/El_Salvador') - interval '1 day'
        WHERE id = $1`,
      [id],
    );
    expect((await history(patient.id, guest.token)).status).toBe(403);
  });

  it('una interconsulta revocada ya no da acceso', async () => {
    const { doctor, patient } = await scene();
    const guest = await actor('doctor', [central.id]);
    const id = (await insertReferral({ patientId: patient.id, providerId: guest.id, grantedBy: doctor.id })).rows[0].id;
    await pool.query('UPDATE referrals SET revoked_at = now(), revoked_by = $2 WHERE id = $1', [id, doctor.id]);
    expect((await history(patient.id, guest.token)).status).toBe(403);
  });

  it('una interconsulta de otro paciente o para otro médico no sirve', async () => {
    const { doctor, patient } = await scene();
    const guest = await actor('doctor', [central.id]);
    const otherGuest = await actor('doctor', [central.id]);
    const otherPatient = await createTestPatient();
    await insertReferral({ patientId: otherPatient.id, providerId: guest.id, grantedBy: doctor.id });
    await insertReferral({ patientId: patient.id, providerId: otherGuest.id, grantedBy: doctor.id });
    expect((await history(patient.id, guest.token)).status).toBe(403);
  });

  it('RB-04: el historial es el mismo desde cualquier sucursal, con las notas de todos los médicos', async () => {
    const { doctor, patient, appointmentId } = await scene();
    const colleague = await actor('doctor', [escalon.id]);
    const colleagueAppointment = await appointmentOf(colleague, patient.id);
    await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, appointmentId, diagnosis: 'Nota de Central' });
    await insertMedicalRecord({
      patientId: patient.id, doctorId: colleague.id, branchId: escalon.id,
      appointmentId: colleagueAppointment, diagnosis: 'Nota de Escalón',
    });

    // El primer médico, trabajando desde Escalón, ve su nota y la del colega.
    const fromEscalon = await history(patient.id, doctor.token, '', { 'X-Sucursal-Id': escalon.id });
    const fromCentral = await history(patient.id, doctor.token, '', { 'X-Sucursal-Id': central.id });
    for (const response of [fromEscalon, fromCentral]) {
      expect(response.status).toBe(200);
      expect(response.body.data.map((note: { diagnosis: string }) => note.diagnosis).sort()).toEqual([
        'Nota de Central', 'Nota de Escalón',
      ]);
    }
    const escalonNote = fromCentral.body.data.find((note: { diagnosis: string }) => note.diagnosis === 'Nota de Escalón');
    expect(escalonNote).toMatchObject({ doctor_name: 'Usuario de Prueba', branch_id: escalon.id, branch_name: expect.any(String) });
  });

  it('un paciente inactivo conserva su historial', async () => {
    const { doctor, patient } = await scene();
    await pool.query('UPDATE patients SET is_active = false WHERE id = $1', [patient.id]);
    expect((await history(patient.id, doctor.token)).status).toBe(200);
  });

  it('paciente inexistente: 404; identificador mal escrito: 400', async () => {
    const { doctor } = await scene();
    expect((await history(UUID_THAT_DOES_NOT_EXIST, doctor.token)).status).toBe(404);
    expect((await history('no-es-un-uuid', doctor.token)).status).toBe(400);
  });
});

// Defensa en profundidad: aunque a algún rol se le diera por error la capacidad
// medical_records_read, el servicio solo deja pasar a médicos y al administrador.
// Aquí se llama al servicio directamente, sin pasar por la ruta.
describe('accesoPaciente: lista explícita de quién puede entrar (falla cerrada)', () => {
  it.each(['recepcionista', 'encargado_venta', 'directivo'] as const)(
    '%s no entra aunque tenga una cita registrada a su nombre',
    async (role) => {
      const patient = await createTestPatient();
      const user = await actor(role, [central.id]);
      await appointmentOf(user, patient.id); // la base no exige que doctor_id sea un médico
      await expect(
        requirePatientAccess(patient.id, { userId: user.id, role, branchId: central.id }),
      ).rejects.toMatchObject({ statusCode: 403 });
    },
  );
});

// -----------------------------------------------------------------------------
describe('historial: contenido y paginación', () => {
  it('lo más reciente primero, con enmiendas y su conteo', async () => {
    const { doctor, patient, appointmentId } = await scene();
    const first = (await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, appointmentId, diagnosis: 'Original' })).rows[0].id;
    const second = (await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, amendsId: first, diagnosis: 'Enmienda' })).rows[0].id;

    const response = await history(patient.id, doctor.token);
    expect(response.body.data.map((note: { id: string }) => note.id)).toEqual([second, first]);
    const [amendment, original] = response.body.data;
    expect(amendment).toMatchObject({ amends_id: first, appointment_id: null, appointment_starts_at: null, amendment_count: 0 });
    expect(original).toMatchObject({ amends_id: null, appointment_id: appointmentId, amendment_count: 1 });
    expect(original.appointment_starts_at).toMatch(/^20\d{2}-\d{2}-\d{2} 08:00:00$/);
  });

  it('pagina: página, tamaño, total y total de páginas', async () => {
    const { doctor, patient, appointmentId } = await scene();
    const original = (await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, appointmentId })).rows[0].id;
    for (let index = 0; index < 4; index += 1) {
      await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, amendsId: original });
    }
    const page2 = await history(patient.id, doctor.token, '?page=2&page_size=2');
    expect(page2.body.data).toHaveLength(2);
    expect(page2.body.pagination).toEqual({ page: 2, page_size: 2, total: 5, total_pages: 3 });
    const page3 = await history(patient.id, doctor.token, '?page=3&page_size=2');
    expect(page3.body.data).toHaveLength(1);
  });

  it.each(['?page=0', '?page_size=0', '?page_size=201', '?page=x'])('rechaza el filtro inválido %s', async (query) => {
    const { doctor, patient } = await scene();
    expect((await history(patient.id, doctor.token, query)).status).toBe(400);
  });

  it('un paciente sin notas devuelve una lista vacía', async () => {
    const { doctor, patient } = await scene();
    const response = await history(patient.id, doctor.token);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination.total).toBe(0);
  });
});

// -----------------------------------------------------------------------------
describe('RF-09: bitácora y falla cerrada', () => {
  it('cada lectura queda registrada con quién, desde qué sucursal y por qué razón', async () => {
    const { doctor, patient } = await scene();
    await history(patient.id, doctor.token, '', { 'X-Sucursal-Id': escalon.id });
    const [row] = await auditRows('record_viewed', patient.id);
    expect(row).toMatchObject({ entity_type: 'patient', actor_id: doctor.id, branch_id: escalon.id });
    expect(row.detail).toEqual({ access: 'appointment' });
  });

  it('si no se puede escribir la bitácora, NO se entregan los datos', async () => {
    const { doctor, patient, appointmentId } = await scene();
    await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, appointmentId, diagnosis: 'Secreto' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(auditModel, 'createAuditEntry').mockRejectedValue(new Error('bitácora caída'));
    const response = await history(patient.id, doctor.token);
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('Secreto');
  });

  it('falla cerrada: si la verificación de acceso falla, se niega (403) y se audita', async () => {
    const { doctor, patient } = await scene();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(recordsModel, 'doctorHasAppointmentWith').mockRejectedValue(new Error('base caída'));
    const response = await history(patient.id, doctor.token);
    expect(response.status).toBe(403);
    expect(response.body.data).toBeUndefined();
    const [row] = await auditRows('record_access_denied', patient.id);
    expect(row.detail).toEqual({ reason: 'check_failed' });
  });
});

// -----------------------------------------------------------------------------
describe('escribir la nota de una consulta', () => {
  it('guarda la nota con el médico del token y la sucursal activa, e ignora lo que el cuerpo diga', async () => {
    const { doctor, patient, appointmentId } = await scene();
    const impostor = await actor('doctor', [central.id]);
    const response = await writeNote(
      patient.id,
      doctor.token,
      {
        appointment_id: appointmentId, diagnosis: '  Miopía  ', treatment: 'Lentes', notes: '  Control en 6 meses ',
        doctor_id: impostor.id, branch_id: central.id, patient_id: UUID_THAT_DOES_NOT_EXIST,
      },
      { 'X-Sucursal-Id': escalon.id },
    );
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      patient_id: patient.id, doctor_id: doctor.id, branch_id: escalon.id, appointment_id: appointmentId,
      diagnosis: 'Miopía', treatment: 'Lentes', notes: 'Control en 6 meses', amends_id: null, amendment_count: 0,
    });
  });

  it('el tratamiento y las notas vacíos se guardan como "sin dato"', async () => {
    const { doctor, patient, appointmentId } = await scene();
    const response = await writeNote(patient.id, doctor.token, { appointment_id: appointmentId, diagnosis: 'Examen normal', treatment: '   ', notes: '' });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ treatment: null, notes: null });
  });

  it('RB-03: queda en la bitácora quién la escribió y desde qué sucursal', async () => {
    const { doctor, patient, appointmentId } = await scene();
    const response = await writeNote(patient.id, doctor.token, { appointment_id: appointmentId, diagnosis: 'x' }, { 'X-Sucursal-Id': escalon.id });
    const [row] = await auditRows('record_created', response.body.data.id);
    expect(row).toMatchObject({ entity_type: 'medical_record', actor_id: doctor.id, branch_id: escalon.id });
    expect(row.detail).toEqual({ patient_id: patient.id, appointment_id: appointmentId });
  });

  it.each([
    ['sin diagnóstico', { diagnosis: '' }],
    ['con diagnóstico de solo espacios', { diagnosis: '   ' }],
    ['con un diagnóstico muy largo', { diagnosis: 'x'.repeat(2001) }],
    ['con un tratamiento muy largo', { diagnosis: 'x', treatment: 'x'.repeat(2001) }],
    ['con notas muy largas', { diagnosis: 'x', notes: 'x'.repeat(4001) }],
    ['con una cita mal escrita', { diagnosis: 'x', appointment_id: 'no-es-un-uuid' }],
  ])('rechaza la nota %s (400)', async (_name, overrides) => {
    const { doctor, patient, appointmentId } = await scene();
    const response = await writeNote(patient.id, doctor.token, { appointment_id: appointmentId, ...overrides });
    expect(response.status).toBe(400);
  });

  it('rechaza una nota sin cita (400)', async () => {
    const { doctor, patient } = await scene();
    expect((await writeNote(patient.id, doctor.token, { diagnosis: 'x' })).status).toBe(400);
  });

  it('una cita de otro médico: 403', async () => {
    const { patient, appointmentId } = await scene();
    const other = await actor('doctor', [central.id]);
    const response = await writeNote(patient.id, other.token, { appointment_id: appointmentId, diagnosis: 'x' });
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Solo el médico de la cita puede escribir su nota.');
  });

  it('una cita de otro paciente o que no existe: 404', async () => {
    const { doctor, appointmentId } = await scene();
    const otherPatient = await createTestPatient();
    expect((await writeNote(otherPatient.id, doctor.token, { appointment_id: appointmentId, diagnosis: 'x' })).status).toBe(404);
    expect((await writeNote(otherPatient.id, doctor.token, { appointment_id: UUID_THAT_DOES_NOT_EXIST, diagnosis: 'x' })).status).toBe(404);
  });

  it('paciente inexistente: 404', async () => {
    const { doctor, appointmentId } = await scene();
    expect((await writeNote(UUID_THAT_DOES_NOT_EXIST, doctor.token, { appointment_id: appointmentId, diagnosis: 'x' })).status).toBe(404);
  });

  it.each([
    ['cancelled', 'No se puede escribir la nota de una cita cancelada.'],
    ['no_show', 'El paciente no asistió a esa cita: no hay consulta que registrar.'],
  ] as const)('una cita %s no admite nota (409)', async (status, message) => {
    const { doctor, patient, appointmentId } = await scene({ status });
    const response = await writeNote(patient.id, doctor.token, { appointment_id: appointmentId, diagnosis: 'x' });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe(message);
  });

  it('una cita atendida sí admite nota', async () => {
    const { doctor, patient, appointmentId } = await scene({ status: 'completed' });
    expect((await writeNote(patient.id, doctor.token, { appointment_id: appointmentId, diagnosis: 'x' })).status).toBe(201);
  });

  it('una cita de una fecha futura no admite nota; la de hoy sí (hasta el último minuto)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-03-05T10:00:00-06:00'));
    const { doctor, patient } = await scene();
    const tomorrow = await appointmentOf(doctor, patient.id, { day: '2030-03-06' });
    const today = await appointmentOf(doctor, patient.id, { day: '2030-03-05', time: '23:30' });

    const future = await writeNote(patient.id, doctor.token, { appointment_id: tomorrow, diagnosis: 'x' });
    expect(future.status).toBe(409);
    expect(future.body.message).toBe('No se puede escribir la nota de una cita de una fecha futura.');
    expect((await writeNote(patient.id, doctor.token, { appointment_id: today, diagnosis: 'x' })).status).toBe(201);
  });

  it('una consulta tiene una sola nota: la segunda se rechaza y se indica la enmienda (409)', async () => {
    const { doctor, patient, appointmentId } = await scene();
    expect((await writeNote(patient.id, doctor.token, { appointment_id: appointmentId, diagnosis: 'x' })).status).toBe(201);
    const second = await writeNote(patient.id, doctor.token, { appointment_id: appointmentId, diagnosis: 'y' });
    expect(second.status).toBe(409);
    expect(second.body.message).toBe('Esa consulta ya tiene su nota. Para corregirla, agregue una enmienda.');
  });

  it('dos médicos escribiendo la nota de la misma cita a la vez: solo una se guarda', async () => {
    const { doctor, patient, appointmentId } = await scene();
    const results = await Promise.all(
      [1, 2, 3].map(() => writeNote(patient.id, doctor.token, { appointment_id: appointmentId, diagnosis: 'x' })),
    );
    expect(results.map((result) => result.status).sort()).toEqual([201, 409, 409]);
  });
});

// -----------------------------------------------------------------------------
describe('enmiendas (RB-03: se agrega, nunca se edita)', () => {
  async function withNote() {
    const base = await scene();
    const note = await writeNote(base.patient.id, base.doctor.token, { appointment_id: base.appointmentId, diagnosis: 'Original', notes: 'Texto original' });
    return { ...base, noteId: note.body.data.id as string };
  }

  it('agrega una enmienda y la nota original queda intacta', async () => {
    const { doctor, patient, noteId } = await withNote();
    const response = await amend(patient.id, noteId, doctor.token, { diagnosis: 'Corregido', treatment: 'Lentes' });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      amends_id: noteId, appointment_id: null, doctor_id: doctor.id, diagnosis: 'Corregido', treatment: 'Lentes', notes: null,
    });
    const original = (await history(patient.id, doctor.token)).body.data.find((note: { id: string }) => note.id === noteId);
    expect(original).toMatchObject({ diagnosis: 'Original', notes: 'Texto original', amendment_count: 1 });
  });

  it('otro médico que también atendió al paciente puede enmendar, desde su sucursal', async () => {
    const { patient, noteId } = await withNote();
    const colleague = await actor('doctor', [escalon.id]);
    await appointmentOf(colleague, patient.id);
    const response = await amend(patient.id, noteId, colleague.token, { diagnosis: 'Precisión' });
    expect(response.status).toBe(201);
    expect(response.body.data.doctor_id).toBe(colleague.id);
  });

  it('queda en la bitácora', async () => {
    const { doctor, patient, noteId } = await withNote();
    const response = await amend(patient.id, noteId, doctor.token, { diagnosis: 'Corregido' });
    const [row] = await auditRows('record_amended', response.body.data.id);
    expect(row).toMatchObject({ entity_type: 'medical_record', actor_id: doctor.id });
    expect(row.detail).toEqual({ patient_id: patient.id, amends_id: noteId });
  });

  it('una interconsulta es de lectura: quien solo la tiene no puede enmendar (403)', async () => {
    const { doctor, patient, noteId } = await withNote();
    const guest = await actor('doctor', [central.id]);
    await insertReferral({ patientId: patient.id, providerId: guest.id, grantedBy: doctor.id });
    const response = await amend(patient.id, noteId, guest.token, { diagnosis: 'x' });
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Solo un médico que haya atendido al paciente puede enmendar su expediente.');
  });

  it('un médico sin relación con el paciente: 403 y se audita la negativa', async () => {
    const { patient, noteId } = await withNote();
    const stranger = await actor('doctor', [central.id]);
    expect((await amend(patient.id, noteId, stranger.token, { diagnosis: 'x' })).status).toBe(403);
    expect(await auditRows('record_access_denied', patient.id)).toHaveLength(1);
  });

  it('el administrador no enmienda (la enmienda es del médico)', async () => {
    const { patient, noteId } = await withNote();
    const admin = await actor('admin');
    expect((await amend(patient.id, noteId, admin.token, { diagnosis: 'x' })).status).toBe(403);
  });

  it('una nota de OTRO paciente o inexistente: 404', async () => {
    const { doctor, patient } = await withNote();
    const other = await scene();
    const otherNote = await writeNote(other.patient.id, other.doctor.token, { appointment_id: other.appointmentId, diagnosis: 'Ajena' });
    // El médico tiene acceso a SU paciente, pero la nota es de otro: no se puede enmendar por esa vía.
    expect((await amend(patient.id, otherNote.body.data.id, doctor.token, { diagnosis: 'x' })).status).toBe(404);
    expect((await amend(patient.id, UUID_THAT_DOES_NOT_EXIST, doctor.token, { diagnosis: 'x' })).status).toBe(404);
  });

  it('se puede enmendar una enmienda', async () => {
    const { doctor, patient, noteId } = await withNote();
    const first = await amend(patient.id, noteId, doctor.token, { diagnosis: 'Primera corrección' });
    const second = await amend(patient.id, first.body.data.id, doctor.token, { diagnosis: 'Segunda corrección' });
    expect(second.status).toBe(201);
    expect(second.body.data.amends_id).toBe(first.body.data.id);
  });

  it.each([
    ['sin diagnóstico', { diagnosis: '' }],
    ['con un diagnóstico muy largo', { diagnosis: 'x'.repeat(2001) }],
    ['sin cuerpo', {}],
  ])('rechaza la enmienda %s (400)', async (_name, body) => {
    const { doctor, patient, noteId } = await withNote();
    expect((await amend(patient.id, noteId, doctor.token, body)).status).toBe(400);
  });

  it('identificador de nota mal escrito: 400', async () => {
    const { doctor, patient } = await withNote();
    expect((await amend(patient.id, 'no-es-un-uuid', doctor.token, { diagnosis: 'x' })).status).toBe(400);
  });
});
