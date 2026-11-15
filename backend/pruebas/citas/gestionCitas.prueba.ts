// =============================================================================
// gestionCitas.prueba.ts
// Qué prueba:   la API de citas por HTTP: permisos por rol, alcance por sucursal
//               y por médico, agendar con todas sus validaciones, la regla de
//               que nadie tenga dos citas a la vez (también con dos personas
//               agendando al mismo tiempo), consultar la agenda, reprogramar,
//               cancelar, marcar atendida o ausencia, y la auditoría.
// Cómo:         llama a la API real (supertest) sobre la base candray_test.
// Depende de:   app.ts y las ayudas de prueba.
// =============================================================================
import { randomUUID } from 'crypto';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import type { Role } from '../../src/configuracion/roles';
import { isoWeekday, todayInElSalvador } from '../../src/utilidades/fechas';
import { signToken } from '../../src/utilidades/token';
import { createTestPatient, insertAppointment, insertSchedule } from '../ayudas/datosClinicos';
import { createTestBranch, createTestUser, type TestBranch } from '../ayudas/datosPrueba';

const app = createApp();

async function actor(role: Role, branchIds: string[] = []) {
  const user = await createTestUser({ role, branchIds });
  return { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// Una fecha futura fija y su día de la semana.
const DATE = '2030-03-05';
const WEEKDAY = isoWeekday(DATE);
const PAST = '2020-01-06'; // una fecha pasada fija

let central: TestBranch;   // horario de la sucursal de pruebas: 08:00 a 17:00
let escalon: TestBranch;
let receptionist: Awaited<ReturnType<typeof actor>>;      // solo en Central
let receptionistEscalon: Awaited<ReturnType<typeof actor>>; // solo en Escalón

beforeAll(async () => {
  central = await createTestBranch();
  escalon = await createTestBranch();
  receptionist = await actor('recepcionista', [central.id]);
  receptionistEscalon = await actor('recepcionista', [escalon.id]);
});

// Un médico con su propio bloque de 8:00 a 12:00 en Central ese día de la semana
// (y asignado también a Escalón, sin bloque ahí). Cada prueba usa el suyo, para
// que no choquen las horas entre pruebas que corren a la vez.
async function newDoctor(blocks: { branchId: string; start: string; end: string }[] = [
  { branchId: central.id, start: '08:00', end: '12:00' },
]) {
  const doctor = await actor('doctor', [central.id, escalon.id]);
  for (const block of blocks) {
    await insertSchedule({ doctorId: doctor.id, branchId: block.branchId, weekday: WEEKDAY, start: block.start, end: block.end });
  }
  return doctor;
}

// Fija la "hora actual" del servidor (solo el reloj Date; los temporizadores siguen reales).
// `elSalvadorTime` es 'AAAA-MM-DDTHH:MM' en hora de El Salvador (UTC-6, sin horario de verano).
const setClock = (elSalvadorTime: string) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${elSalvadorTime}:00-06:00`));
};
afterEach(() => vi.useRealTimers());

const book = (body: Record<string, unknown>, token = receptionist.token) =>
  request(app).post('/api/citas').set(auth(token)).send(body);

// Agenda con éxito y devuelve la cita.
async function makeAppointment(doctorId: string, overrides: Record<string, unknown> = {}, token = receptionist.token) {
  const patient = await createTestPatient();
  const response = await book({ patient_id: patient.id, doctor_id: doctorId, date: DATE, time: '08:00', ...overrides }, token);
  expect(response.status).toBe(201);
  return { ...(response.body.data as { id: string; starts_at: string; status: string; patient_id: string }), patient };
}

const patchAppointment = (id: string, body: Record<string, unknown>, token = receptionist.token) =>
  request(app).patch(`/api/citas/${id}`).set(auth(token)).send(body);

const setStatus = (id: string, body: Record<string, unknown>, token = receptionist.token) =>
  request(app).patch(`/api/citas/${id}/estado`).set(auth(token)).send(body);

const agenda = (query: string, token = receptionist.token) =>
  request(app).get(`/api/citas?${query}`).set(auth(token));

// Inserta directamente una cita en el pasado (la API no deja agendar en el pasado).
async function pastAppointment(doctorId: string, time = '09:00', branchId = central.id) {
  const patient = await createTestPatient();
  const result = await insertAppointment({
    patientId: patient.id, doctorId, branchId, createdBy: receptionist.id, startsAt: `${PAST} ${time}`,
  });
  return result.rows[0].id;
}

describe('Permisos de /api/citas', () => {
  it('sin token responde 401', async () => {
    expect((await request(app).get(`/api/citas?date=${DATE}`)).status).toBe(401);
  });

  it.each(['encargado_venta', 'directivo'] as Role[])('%s recibe 403 en todo', async (role) => {
    const { token } = await actor(role, role === 'directivo' ? [] : [central.id]);
    const doctor = await newDoctor();
    const appointment = await makeAppointment(doctor.id);
    expect((await agenda(`date=${DATE}`, token)).status).toBe(403);
    expect((await request(app).get(`/api/citas/${appointment.id}`).set(auth(token))).status).toBe(403);
    expect((await book({}, token)).status).toBe(403);
    expect((await patchAppointment(appointment.id, { reason: 'x' }, token)).status).toBe(403);
    expect((await setStatus(appointment.id, { status: 'cancelled' }, token)).status).toBe(403);
  });

  it('el médico consulta pero no agenda, reprograma ni cambia el estado', async () => {
    const doctor = await newDoctor();
    const appointment = await makeAppointment(doctor.id);
    expect((await agenda(`date=${DATE}`, doctor.token)).status).toBe(200);
    expect((await request(app).get(`/api/citas/${appointment.id}`).set(auth(doctor.token))).status).toBe(200);
    expect((await book({}, doctor.token)).status).toBe(403);
    expect((await patchAppointment(appointment.id, { reason: 'x' }, doctor.token)).status).toBe(403);
    expect((await setStatus(appointment.id, { status: 'cancelled' }, doctor.token)).status).toBe(403);
  });

  it('el administrador puede consultar la agenda', async () => {
    const { token } = await actor('admin', [central.id]);
    expect((await agenda(`date=${DATE}`, token)).status).toBe(200);
  });
});

describe('Agendar una cita', () => {
  it('guarda la cita de 30 minutos, agendada, con sus nombres', async () => {
    const doctor = await newDoctor();
    const patient = await createTestPatient();
    const response = await book({ patient_id: patient.id, doctor_id: doctor.id, date: DATE, time: '09:30', reason: 'Examen de la vista' });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      patient_id: patient.id, patient_record_number: patient.record_number,
      doctor_id: doctor.id, branch_id: central.id, branch_code: central.code,
      starts_at: `${DATE} 09:30:00`, ends_at: `${DATE} 10:00:00`,
      status: 'scheduled', reason: 'Examen de la vista', cancellation_reason: null,
      created_by: receptionist.id,
    });
  });

  it('usa la sucursal activa si no se indica, y acepta una propia indicada', async () => {
    const doctor = await newDoctor([
      { branchId: central.id, start: '08:00', end: '12:00' },
      { branchId: escalon.id, start: '14:00', end: '17:00' },
    ]);
    const worker = await actor('recepcionista', [central.id, escalon.id]);
    const patientA = await createTestPatient();
    const patientB = await createTestPatient();
    const byDefault = await book({ patient_id: patientA.id, doctor_id: doctor.id, date: DATE, time: '08:00' }, worker.token);
    expect(byDefault.body.data.branch_id).toBe(central.id);
    const explicit = await book(
      { patient_id: patientB.id, doctor_id: doctor.id, branch_id: escalon.id, date: DATE, time: '14:00' }, worker.token,
    );
    expect(explicit.status).toBe(201);
    expect(explicit.body.data.branch_id).toBe(escalon.id);
  });

  it('una sucursal a la que no se tiene acceso responde 403', async () => {
    const doctor = await newDoctor([{ branchId: escalon.id, start: '08:00', end: '12:00' }]);
    const patient = await createTestPatient();
    const response = await book({ patient_id: patient.id, doctor_id: doctor.id, branch_id: escalon.id, date: DATE, time: '08:00' });
    expect(response.status).toBe(403);
  });

  it('deja una entrada de auditoría con quién y en qué sucursal, sin el motivo', async () => {
    const doctor = await newDoctor();
    const patient = await createTestPatient();
    const response = await book({
      patient_id: patient.id, doctor_id: doctor.id, date: DATE, time: '08:00', reason: 'Dolor de cabeza fuerte',
    });
    const audit = await pool.query(
      `SELECT actor_id, branch_id, detail FROM audit_log
        WHERE entity_type = 'appointment' AND action = 'appointment_created' AND entity_id = $1`,
      [response.body.data.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_id).toBe(receptionist.id);
    expect(audit.rows[0].branch_id).toBe(central.id);
    expect(audit.rows[0].detail).toMatchObject({ patient_id: patient.id, doctor_id: doctor.id, starts_at: `${DATE} 08:00` });
    expect(JSON.stringify(audit.rows[0])).not.toContain('Dolor de cabeza');
  });

  it.each([
    ['sin paciente', { patient_id: undefined }],
    ['paciente que no es uuid', { patient_id: 'abc' }],
    ['sin médico', { doctor_id: undefined }],
    ['sin fecha', { date: undefined }],
    ['fecha con otro formato', { date: '05/03/2030' }],
    ['fecha que no existe', { date: '2030-02-31' }],
    ['sin hora', { time: undefined }],
    ['hora que no es en punto ni y media', { time: '08:15' }],
    ['hora con otro formato', { time: '8:00' }],
    ['motivo de más de 500 caracteres', { reason: 'x'.repeat(501) }],
  ])('el esquema rechaza con 400: %s', async (_name, overrides) => {
    const doctor = await newDoctor();
    const patient = await createTestPatient();
    const response = await book({ patient_id: patient.id, doctor_id: doctor.id, date: DATE, time: '08:00', ...overrides });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Datos inválidos.');
  });

  it('un motivo vacío se guarda como "sin dato"', async () => {
    const doctor = await newDoctor();
    const appointment = await makeAppointment(doctor.id, { reason: '   ' });
    const response = await request(app).get(`/api/citas/${appointment.id}`).set(auth(receptionist.token));
    expect(response.body.data.reason).toBeNull();
  });

  it('rechaza un paciente que no existe o está desactivado', async () => {
    const doctor = await newDoctor();
    const inactive = await createTestPatient();
    await pool.query('UPDATE patients SET is_active = false WHERE id = $1', [inactive.id]);
    for (const patientId of [randomUUID(), inactive.id]) {
      const response = await book({ patient_id: patientId, doctor_id: doctor.id, date: DATE, time: '08:00' });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('El paciente no existe o está inactivo.');
    }
  });

  it('rechaza a alguien que no es médico, o un médico desactivado', async () => {
    const patient = await createTestPatient();
    const notDoctor = await createTestUser({ role: 'recepcionista', branchIds: [central.id] });
    const inactive = await createTestUser({ role: 'doctor', branchIds: [central.id], isActive: false });
    for (const doctorId of [notDoctor.id, inactive.id, randomUUID()]) {
      const response = await book({ patient_id: patient.id, doctor_id: doctorId, date: DATE, time: '08:00' });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('El usuario indicado no es un médico activo.');
    }
  });

  it('rechaza un médico que no está asignado a la sucursal', async () => {
    const outsider = await actor('doctor', [escalon.id]);
    await insertSchedule({ doctorId: outsider.id, branchId: central.id, weekday: WEEKDAY, start: '08:00', end: '12:00' });
    const patient = await createTestPatient();
    const response = await book({ patient_id: patient.id, doctor_id: outsider.id, date: DATE, time: '08:00' });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('El médico no está asignado a esa sucursal.');
  });

  it('rechaza una hora que ya pasó', async () => {
    const doctor = await newDoctor();
    const patient = await createTestPatient();
    for (const [date, time] of [[PAST, '08:00'], [todayInElSalvador(), '00:00']]) {
      const response = await book({ patient_id: patient.id, doctor_id: doctor.id, date, time });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('No se puede agendar una cita en una fecha u hora que ya pasó.');
    }
  });

  it('una cita que empieza justo ahora ya cuenta como pasada; la siguiente franja, no', async () => {
    const doctor = await newDoctor();
    setClock(`${DATE}T08:00`);
    // Los tokens llevan fecha de vencimiento: se crean con el reloj ya fijado.
    const worker = await actor('recepcionista', [central.id]);
    const patientA = await createTestPatient();
    const patientB = await createTestPatient();
    const now = await book({ patient_id: patientA.id, doctor_id: doctor.id, date: DATE, time: '08:00' }, worker.token);
    expect(now.status).toBe(400);
    const next = await book({ patient_id: patientB.id, doctor_id: doctor.id, date: DATE, time: '08:30' }, worker.token);
    expect(next.status).toBe(201);
  });

  it.each([
    ['antes del bloque', DATE, '07:30'],
    ['justo al terminar el bloque', DATE, '12:00'],
    ['en un día sin bloque', '2030-03-06', '08:00'],
  ])('rechaza una cita fuera de la atención del médico: %s', async (_name, date, time) => {
    const doctor = await newDoctor();
    const patient = await createTestPatient();
    const response = await book({ patient_id: patient.id, doctor_id: doctor.id, date, time });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Ese horario está fuera de la atención del médico en esa sucursal.');
  });

  it('acepta la primera y la última franja del bloque', async () => {
    const doctor = await newDoctor();
    await makeAppointment(doctor.id, { time: '08:00' });
    await makeAppointment(doctor.id, { time: '11:30' });
  });

  it('el bloque de otra sucursal no sirve para agendar en esta', async () => {
    const doctor = await newDoctor([{ branchId: escalon.id, start: '08:00', end: '12:00' }]);
    const patient = await createTestPatient();
    const response = await book({ patient_id: patient.id, doctor_id: doctor.id, date: DATE, time: '08:00' });
    expect(response.status).toBe(400);
  });
});

describe('Nadie tiene dos citas a la vez', () => {
  it('el médico ya ocupado responde 409', async () => {
    const doctor = await newDoctor();
    await makeAppointment(doctor.id, { time: '09:00' });
    const other = await createTestPatient();
    const response = await book({ patient_id: other.id, doctor_id: doctor.id, date: DATE, time: '09:00' });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('El médico ya tiene una cita a esa hora.');
  });

  it('el paciente ya ocupado con otro médico responde 409', async () => {
    const first = await newDoctor();
    const second = await newDoctor();
    const appointment = await makeAppointment(first.id, { time: '09:00' });
    const response = await book({ patient_id: appointment.patient.id, doctor_id: second.id, date: DATE, time: '09:00' });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('El paciente ya tiene una cita a esa hora.');
  });

  it('citas seguidas del mismo médico sí se permiten', async () => {
    const doctor = await newDoctor();
    await makeAppointment(doctor.id, { time: '09:00' });
    await makeAppointment(doctor.id, { time: '09:30' });
    await makeAppointment(doctor.id, { time: '08:30' });
  });

  it('una cita cancelada libera la hora', async () => {
    const doctor = await newDoctor();
    const appointment = await makeAppointment(doctor.id, { time: '09:00' });
    expect((await setStatus(appointment.id, { status: 'cancelled' })).status).toBe(200);
    await makeAppointment(doctor.id, { time: '09:00' });
  });

  it('dos personas agendando la misma hora a la vez: una gana y la otra recibe 409', async () => {
    const doctor = await newDoctor();
    const [patientA, patientB] = [await createTestPatient(), await createTestPatient()];
    const worker = await actor('recepcionista', [central.id]);
    const attempts = await Promise.all([
      book({ patient_id: patientA.id, doctor_id: doctor.id, date: DATE, time: '10:00' }),
      book({ patient_id: patientB.id, doctor_id: doctor.id, date: DATE, time: '10:00' }, worker.token),
    ]);
    expect(attempts.map((r) => r.status).sort()).toEqual([201, 409]);
  });
});

describe('Consultar la agenda', () => {
  it('lista las citas del día, ordenadas por hora, con los nombres', async () => {
    const doctor = await newDoctor();
    await makeAppointment(doctor.id, { time: '10:00' });
    await makeAppointment(doctor.id, { time: '08:30' });
    const response = await agenda(`date=${DATE}&doctor_id=${doctor.id}`);
    expect(response.status).toBe(200);
    expect(response.body.data.map((a: { starts_at: string }) => a.starts_at.slice(11, 16))).toEqual(['08:30', '10:00']);
    expect(response.body.data[0]).toEqual(expect.objectContaining({
      patient_name: expect.any(String), patient_phone: expect.any(String), doctor_name: expect.any(String),
      branch_name: expect.any(String), created_by_name: expect.any(String),
    }));
  });

  it('filtra por paciente, por estado y por rango de fechas', async () => {
    const doctor = await newDoctor();
    const first = await makeAppointment(doctor.id, { time: '08:00' });
    const second = await makeAppointment(doctor.id, { time: '08:30' });
    await setStatus(second.id, { status: 'cancelled' });

    const byPatient = await agenda(`patient_id=${first.patient.id}`);
    expect(byPatient.body.data.map((a: { id: string }) => a.id)).toEqual([first.id]);

    const cancelled = await agenda(`date=${DATE}&doctor_id=${doctor.id}&status=cancelled`);
    expect(cancelled.body.data.map((a: { id: string }) => a.id)).toEqual([second.id]);

    const range = await agenda(`from=2030-03-04&to=2030-03-06&doctor_id=${doctor.id}`);
    expect(range.body.data).toHaveLength(2);
    const outside = await agenda(`from=2030-03-06&to=2030-03-07&doctor_id=${doctor.id}`);
    expect(outside.body.data).toHaveLength(0);
  });

  it('con date solo trae ese día (ni el anterior ni el siguiente)', async () => {
    const doctor = await newDoctor();
    const sameDay = await makeAppointment(doctor.id, { time: '08:00' });
    await makeAppointment(doctor.id, { date: '2030-03-12', time: '08:00' }); // una semana después
    await makeAppointment(doctor.id, { date: '2030-02-26', time: '08:00' }); // una semana antes
    const response = await agenda(`date=${DATE}&doctor_id=${doctor.id}`);
    expect(response.body.data.map((a: { id: string }) => a.id)).toEqual([sameDay.id]);
  });

  it('pagina los resultados y calcula el total', async () => {
    const doctor = await newDoctor();
    for (const time of ['08:00', '08:30', '09:00']) await makeAppointment(doctor.id, { time });
    const first = await agenda(`date=${DATE}&doctor_id=${doctor.id}&page_size=2&page=1`);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.pagination).toEqual({ page: 1, page_size: 2, total: 3, total_pages: 2 });
    const second = await agenda(`date=${DATE}&doctor_id=${doctor.id}&page_size=2&page=2`);
    expect(second.body.data).toHaveLength(1);
  });

  it('la recepcionista solo ve las citas de sus sucursales', async () => {
    const doctor = await newDoctor([
      { branchId: central.id, start: '08:00', end: '10:00' },
      { branchId: escalon.id, start: '14:00', end: '16:00' },
    ]);
    const inCentral = await makeAppointment(doctor.id, { time: '08:00' });
    const inEscalon = await makeAppointment(doctor.id, { time: '14:00', branch_id: escalon.id }, receptionistEscalon.token);
    // Cada recepcionista ve solo la cita de su sucursal.
    const idsEscalon = (await agenda(`date=${DATE}&doctor_id=${doctor.id}`, receptionistEscalon.token)).body.data
      .map((a: { id: string }) => a.id);
    expect(idsEscalon).toEqual([inEscalon.id]);
    const ids = (await agenda(`date=${DATE}&doctor_id=${doctor.id}`)).body.data.map((a: { id: string }) => a.id);
    expect(ids).toEqual([inCentral.id]);
  });

  it('pedir una sucursal ajena responde 403', async () => {
    expect((await agenda(`date=${DATE}&branch_id=${escalon.id}`)).status).toBe(403);
  });

  it('el médico solo ve SUS citas, aunque pida las de otro', async () => {
    const mine = await newDoctor();
    const other = await newDoctor();
    const myAppointment = await makeAppointment(mine.id, { time: '08:00' });
    await makeAppointment(other.id, { time: '08:00' });
    const own = await agenda(`date=${DATE}`, mine.token);
    expect(own.body.data.every((a: { doctor_id: string }) => a.doctor_id === mine.id)).toBe(true);
    expect(own.body.data.map((a: { id: string }) => a.id)).toContain(myAppointment.id);
    const asked = await agenda(`date=${DATE}&doctor_id=${other.id}`, mine.token);
    expect(asked.body.data.every((a: { doctor_id: string }) => a.doctor_id === mine.id)).toBe(true);
  });

  it.each([
    ['sin ninguna fecha ni paciente', ''],
    ['fecha y rango a la vez', `date=${DATE}&from=${DATE}&to=${DATE}`],
    ['rango sin "to"', `from=${DATE}`],
    ['rango al revés', 'from=2030-03-06&to=2030-03-05'],
    ['rango de más de 31 días', 'from=2030-01-01&to=2030-02-02'],
    ['fecha que no existe', 'date=2030-02-31'],
    ['estado inválido', `date=${DATE}&status=otro`],
    ['página 0', `date=${DATE}&page=0`],
    ['page_size 201', `date=${DATE}&page_size=201`],
    ['médico que no es uuid', `date=${DATE}&doctor_id=abc`],
  ])('rechaza con 400: %s', async (_name, query) => {
    expect((await agenda(query)).status).toBe(400);
  });

  it('acepta un rango de exactamente 31 días', async () => {
    expect((await agenda('from=2030-01-01&to=2030-01-31')).status).toBe(200);
  });
});

describe('Ver una cita', () => {
  it('devuelve la cita', async () => {
    const doctor = await newDoctor();
    const appointment = await makeAppointment(doctor.id);
    const response = await request(app).get(`/api/citas/${appointment.id}`).set(auth(receptionist.token));
    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(appointment.id);
  });

  it('responde 404 si no existe, y 400 si el id está mal escrito', async () => {
    expect((await request(app).get(`/api/citas/${randomUUID()}`).set(auth(receptionist.token))).status).toBe(404);
    expect((await request(app).get('/api/citas/no-es-un-uuid').set(auth(receptionist.token))).status).toBe(400);
  });

  it('una cita de otra sucursal, o de otro médico para un médico, responde 404', async () => {
    const doctor = await newDoctor([{ branchId: escalon.id, start: '08:00', end: '12:00' }]);
    const appointment = await makeAppointment(doctor.id, { branch_id: escalon.id }, receptionistEscalon.token);
    expect((await request(app).get(`/api/citas/${appointment.id}`).set(auth(receptionist.token))).status).toBe(404);
    const otherDoctor = await actor('doctor', [escalon.id]);
    expect((await request(app).get(`/api/citas/${appointment.id}`).set(auth(otherDoctor.token))).status).toBe(404);
    expect((await request(app).get(`/api/citas/${appointment.id}`).set(auth(doctor.token))).status).toBe(200);
  });
});

describe('Reprogramar una cita', () => {
  it('cambia la hora y deja auditoría con la hora anterior y la nueva', async () => {
    const doctor = await newDoctor();
    const appointment = await makeAppointment(doctor.id, { time: '08:00' });
    const response = await patchAppointment(appointment.id, { time: '10:30' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ starts_at: `${DATE} 10:30:00`, ends_at: `${DATE} 11:00:00`, status: 'scheduled' });
    const audit = await pool.query(
      `SELECT actor_id, branch_id, detail FROM audit_log WHERE action = 'appointment_rescheduled' AND entity_id = $1`,
      [appointment.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_id).toBe(receptionist.id);
    expect(audit.rows[0].detail.starts_at).toEqual({ from: `${DATE} 08:00`, to: `${DATE} 10:30` });
  });

  it('puede cambiar de médico', async () => {
    const first = await newDoctor();
    const second = await newDoctor();
    const appointment = await makeAppointment(first.id, { time: '08:00' });
    const response = await patchAppointment(appointment.id, { doctor_id: second.id });
    expect(response.status).toBe(200);
    expect(response.body.data.doctor_id).toBe(second.id);
  });

  it('puede cambiar de sucursal si tiene acceso y el médico atiende ahí', async () => {
    const doctor = await newDoctor([
      { branchId: central.id, start: '08:00', end: '12:00' },
      { branchId: escalon.id, start: '14:00', end: '16:00' },
    ]);
    const worker = await actor('recepcionista', [central.id, escalon.id]);
    const appointment = await makeAppointment(doctor.id, {}, worker.token);
    const response = await patchAppointment(appointment.id, { branch_id: escalon.id, time: '14:00' }, worker.token);
    expect(response.status).toBe(200);
    expect(response.body.data.branch_id).toBe(escalon.id);
    const audit = await pool.query(
      `SELECT detail FROM audit_log WHERE action = 'appointment_rescheduled' AND entity_id = $1`, [appointment.id],
    );
    expect(audit.rows[0].detail.branch_id).toEqual({ from: central.id, to: escalon.id });
  });

  it('cambiar solo el motivo no revisa la hora (la cita de hoy que ya empezó se puede corregir)', async () => {
    const doctor = await newDoctor();
    const id = await pastAppointment(doctor.id);
    const response = await patchAppointment(id, { reason: 'Motivo corregido' });
    expect(response.status).toBe(200);
    expect(response.body.data.reason).toBe('Motivo corregido');
    const audit = await pool.query(
      `SELECT detail FROM audit_log WHERE action = 'appointment_rescheduled' AND entity_id = $1`, [id],
    );
    expect(audit.rows[0].detail).toEqual({ reason: true });
  });

  it('rechaza pasar la cita a una hora ocupada del médico o del paciente (409)', async () => {
    const doctor = await newDoctor();
    const other = await newDoctor();
    const a = await makeAppointment(doctor.id, { time: '08:00' });
    await makeAppointment(doctor.id, { time: '09:00' });
    const doctorBusy = await patchAppointment(a.id, { time: '09:00' });
    expect(doctorBusy.status).toBe(409);
    expect(doctorBusy.body.message).toBe('El médico ya tiene una cita a esa hora.');

    // El mismo paciente ya tiene cita a las 10:00 con otro médico.
    const b = await makeAppointment(doctor.id, { time: '10:00' });
    await book({ patient_id: a.patient.id, doctor_id: other.id, date: DATE, time: '11:00' });
    const patientBusy = await patchAppointment(b.id, { doctor_id: other.id, time: '11:00' });
    expect(patientBusy.status).toBe(409);
  });

  it('rechaza pasarla al pasado o fuera de la atención del médico', async () => {
    const doctor = await newDoctor();
    const appointment = await makeAppointment(doctor.id);
    expect((await patchAppointment(appointment.id, { date: PAST })).status).toBe(400);
    const outside = await patchAppointment(appointment.id, { time: '13:00' });
    expect(outside.status).toBe(400);
    expect(outside.body.message).toBe('Ese horario está fuera de la atención del médico en esa sucursal.');
  });

  it('rechaza un médico sin bloque ese día o no asignado a la sucursal', async () => {
    const doctor = await newDoctor();
    const noBlock = await actor('doctor', [central.id]);
    const appointment = await makeAppointment(doctor.id);
    expect((await patchAppointment(appointment.id, { doctor_id: noBlock.id })).status).toBe(400);
    const notDoctor = await createTestUser({ role: 'recepcionista', branchIds: [central.id] });
    expect((await patchAppointment(appointment.id, { doctor_id: notDoctor.id })).status).toBe(400);
  });

  it('si no cambia nada, responde 200 y no deja auditoría', async () => {
    const doctor = await newDoctor();
    const appointment = await makeAppointment(doctor.id, { time: '08:00', reason: 'Control' });
    expect((await patchAppointment(appointment.id, { time: '08:00', reason: 'Control' })).status).toBe(200);
    const audit = await pool.query(
      `SELECT 1 FROM audit_log WHERE action = 'appointment_rescheduled' AND entity_id = $1`, [appointment.id],
    );
    expect(audit.rows).toHaveLength(0);
  });

  it.each(['cancelled', 'completed', 'no_show'] as const)('no se reprograma una cita %s (409)', async (status) => {
    const doctor = await newDoctor();
    const patient = await createTestPatient();
    const created = await insertAppointment({
      patientId: patient.id, doctorId: doctor.id, branchId: central.id, createdBy: receptionist.id,
      startsAt: `${DATE} 08:00`, status,
    });
    const response = await patchAppointment(created.rows[0].id, { time: '09:00' });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Solo se puede reprogramar una cita agendada.');
  });

  it('un cuerpo vacío explica que falta indicar un campo', async () => {
    const doctor = await newDoctor();
    const appointment = await makeAppointment(doctor.id);
    const response = await patchAppointment(appointment.id, {});
    expect(response.status).toBe(400);
    expect(response.body.errors[0].message).toBe('Indique al menos un campo para modificar');
  });

  it('el paciente de la cita no se puede cambiar', async () => {
    const doctor = await newDoctor();
    const appointment = await makeAppointment(doctor.id);
    const other = await createTestPatient();
    await patchAppointment(appointment.id, { patient_id: other.id, reason: 'Otro' });
    const after = await request(app).get(`/api/citas/${appointment.id}`).set(auth(receptionist.token));
    expect(after.body.data.patient_id).toBe(appointment.patient_id);
  });

  it('responde 404 si no existe o es de una sucursal ajena', async () => {
    expect((await patchAppointment(randomUUID(), { reason: 'x' })).status).toBe(404);
    const doctor = await newDoctor([{ branchId: escalon.id, start: '08:00', end: '12:00' }]);
    const foreign = await makeAppointment(doctor.id, { branch_id: escalon.id }, receptionistEscalon.token);
    expect((await patchAppointment(foreign.id, { reason: 'x' })).status).toBe(404);
  });
});

describe('Cambiar el estado de una cita', () => {
  it('cancelar guarda el motivo, deja auditoría y libera la hora', async () => {
    const doctor = await newDoctor();
    const appointment = await makeAppointment(doctor.id, { time: '09:00' });
    const response = await setStatus(appointment.id, { status: 'cancelled', cancellation_reason: 'El paciente avisó' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'cancelled', cancellation_reason: 'El paciente avisó' });
    const audit = await pool.query(
      `SELECT actor_id, branch_id, detail FROM audit_log WHERE action = 'appointment_cancelled' AND entity_id = $1`,
      [appointment.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_id).toBe(receptionist.id);
    expect(audit.rows[0].branch_id).toBe(central.id);
    expect(audit.rows[0].detail).toEqual({ from: 'scheduled', to: 'cancelled' });
    expect(JSON.stringify(audit.rows[0])).not.toContain('avisó');
  });

  it('cancelar sin motivo también se permite', async () => {
    const doctor = await newDoctor();
    const appointment = await makeAppointment(doctor.id);
    const response = await setStatus(appointment.id, { status: 'cancelled' });
    expect(response.body.data).toMatchObject({ status: 'cancelled', cancellation_reason: null });
  });

  it.each([
    ['completed', 'appointment_completed'],
    ['no_show', 'appointment_no_show'],
  ] as const)('una cita ya iniciada se marca %s y se audita como %s', async (status, action) => {
    const doctor = await newDoctor();
    const id = await pastAppointment(doctor.id);
    const response = await setStatus(id, { status });
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe(status);
    const audit = await pool.query(`SELECT 1 FROM audit_log WHERE action = $1 AND entity_id = $2`, [action, id]);
    expect(audit.rows).toHaveLength(1);
  });

  it('una cita que empieza justo ahora ya se puede marcar atendida; un minuto antes, no', async () => {
    const doctor = await newDoctor();
    const patient = await createTestPatient();
    const created = await insertAppointment({
      patientId: patient.id, doctorId: doctor.id, branchId: central.id, createdBy: receptionist.id,
      startsAt: `${DATE} 08:00`,
    });
    const id = created.rows[0].id;
    setClock(`${DATE}T07:59`);
    const worker = await actor('recepcionista', [central.id]);
    expect((await setStatus(id, { status: 'completed' }, worker.token)).status).toBe(400);
    setClock(`${DATE}T08:00`);
    expect((await setStatus(id, { status: 'completed' }, worker.token)).status).toBe(200);
  });

  it.each(['completed', 'no_show'] as const)('una cita futura no se puede marcar %s (400)', async (status) => {
    const doctor = await newDoctor();
    const appointment = await makeAppointment(doctor.id);
    const response = await setStatus(appointment.id, { status });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('La cita todavía no ha comenzado.');
  });

  it.each(['cancelled', 'completed', 'no_show'] as const)('una cita %s ya no cambia de estado (409)', async (first) => {
    const doctor = await newDoctor();
    const patient = await createTestPatient();
    const created = await insertAppointment({
      patientId: patient.id, doctorId: doctor.id, branchId: central.id, createdBy: receptionist.id,
      startsAt: `${PAST} 09:00`, status: first,
    });
    const response = await setStatus(created.rows[0].id, { status: 'cancelled' });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Solo se puede cambiar el estado de una cita agendada.');
  });

  it('dos cancelaciones a la vez: una gana y la otra recibe 409', async () => {
    const doctor = await newDoctor();
    const appointment = await makeAppointment(doctor.id);
    const results = await Promise.all([
      setStatus(appointment.id, { status: 'cancelled' }),
      setStatus(appointment.id, { status: 'cancelled' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it.each([
    ['estado "scheduled"', { status: 'scheduled' }],
    ['estado inventado', { status: 'otro' }],
    ['sin estado', {}],
    ['motivo con un estado que no es cancelar', { status: 'completed', cancellation_reason: 'x' }],
    ['motivo de más de 500 caracteres', { status: 'cancelled', cancellation_reason: 'x'.repeat(501) }],
  ])('rechaza con 400: %s', async (_name, body) => {
    const doctor = await newDoctor();
    const appointment = await makeAppointment(doctor.id);
    const response = await setStatus(appointment.id, body);
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Datos inválidos.');
  });

  it('responde 404 si no existe o es de una sucursal ajena', async () => {
    expect((await setStatus(randomUUID(), { status: 'cancelled' })).status).toBe(404);
    const doctor = await newDoctor([{ branchId: escalon.id, start: '08:00', end: '12:00' }]);
    const foreign = await makeAppointment(doctor.id, { branch_id: escalon.id }, receptionistEscalon.token);
    expect((await setStatus(foreign.id, { status: 'cancelled' })).status).toBe(404);
  });
});
