// =============================================================================
// gestionHorarios.prueba.ts
// Qué prueba:   los bloques del horario semanal de los médicos por HTTP:
//               permisos por rol, alcance por sucursal, creación y validaciones,
//               cruces, modificación, borrado, la protección de las citas
//               agendadas y la auditoría.
// Cómo:         llama a la API real (supertest) sobre la base candray_test.
// Depende de:   app.ts, ayudas/datosPrueba.ts y ayudas/datosClinicos.ts.
// =============================================================================
import { randomUUID } from 'crypto';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import type { Role } from '../../src/configuracion/roles';
import { isoWeekday } from '../../src/utilidades/fechas';
import { signToken } from '../../src/utilidades/token';
import { createTestPatient, insertAppointment } from '../ayudas/datosClinicos';
import { createTestBranch, createTestUser, type TestBranch } from '../ayudas/datosPrueba';

const app = createApp();

async function actor(role: Role, branchIds: string[] = []) {
  const user = await createTestUser({ role, branchIds });
  return { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// Una fecha futura fija y su día de la semana (para citas que caen en un bloque).
const FUTURE_DATE = '2030-03-04';
const FUTURE_WEEKDAY = isoWeekday(FUTURE_DATE);

let central: TestBranch;   // horario de la sucursal de pruebas: 08:00 a 17:00
let escalon: TestBranch;
let admin: Awaited<ReturnType<typeof actor>>;
let receptionist: Awaited<ReturnType<typeof actor>>;

beforeAll(async () => {
  central = await createTestBranch();
  escalon = await createTestBranch();
  admin = await actor('admin', [central.id]);
  receptionist = await actor('recepcionista', [central.id]);
});

// Un médico asignado a las sucursales indicadas (por defecto, Central y Escalón).
const newDoctor = (branchIds = [central.id, escalon.id]) => createTestUser({ role: 'doctor', branchIds });

const create = (body: Record<string, unknown>, token = admin.token) =>
  request(app).post('/api/horarios').set(auth(token)).send(body);

const patch = (id: string, body: Record<string, unknown>, token = admin.token) =>
  request(app).patch(`/api/horarios/${id}`).set(auth(token)).send(body);

// Crea un bloque válido y devuelve lo que responde la API.
async function makeBlock(doctorId: string, overrides: Record<string, unknown> = {}) {
  const response = await create({
    doctor_id: doctorId, branch_id: central.id, weekday: FUTURE_WEEKDAY,
    start_time: '08:00', end_time: '12:00', ...overrides,
  });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; branch_id: string; start_time: string; end_time: string };
}

// Agenda una cita futura de ese médico en Central (a la hora indicada del día FUTURE_DATE).
async function bookFuture(doctorId: string, time: string, status: 'scheduled' | 'cancelled' | 'completed' = 'scheduled') {
  const patient = await createTestPatient();
  await insertAppointment({
    patientId: patient.id, doctorId, branchId: central.id, createdBy: receptionist.id,
    startsAt: `${FUTURE_DATE} ${time}`, status,
  });
}

describe('Permisos de /api/horarios', () => {
  it('sin token responde 401', async () => {
    expect((await request(app).get('/api/horarios')).status).toBe(401);
  });

  it.each(['encargado_venta', 'directivo'] as Role[])('%s recibe 403 en todo', async (role) => {
    const { token } = await actor(role, role === 'directivo' ? [] : [central.id]);
    const block = await makeBlock((await newDoctor()).id);
    expect((await request(app).get('/api/horarios').set(auth(token))).status).toBe(403);
    expect((await request(app).get(`/api/horarios/${block.id}`).set(auth(token))).status).toBe(403);
    expect((await create({}, token)).status).toBe(403);
    expect((await patch(block.id, { end_time: '11:00' }, token)).status).toBe(403);
    expect((await request(app).delete(`/api/horarios/${block.id}`).set(auth(token))).status).toBe(403);
  });

  it.each(['doctor', 'recepcionista'] as Role[])('%s puede ver los horarios pero no cambiarlos', async (role) => {
    const { token } = await actor(role, [central.id]);
    const block = await makeBlock((await newDoctor()).id);
    expect((await request(app).get('/api/horarios').set(auth(token))).status).toBe(200);
    expect((await request(app).get(`/api/horarios/${block.id}`).set(auth(token))).status).toBe(200);
    expect((await create({}, token)).status).toBe(403);
    expect((await patch(block.id, { end_time: '11:00' }, token)).status).toBe(403);
    expect((await request(app).delete(`/api/horarios/${block.id}`).set(auth(token))).status).toBe(403);
  });
});

describe('Crear un bloque', () => {
  it('guarda el bloque con los nombres del médico y la sucursal', async () => {
    const doctor = await newDoctor();
    const response = await create({
      doctor_id: doctor.id, branch_id: central.id, weekday: 3, start_time: '08:00', end_time: '12:30',
    });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      doctor_id: doctor.id, doctor_name: 'Usuario de Prueba', branch_id: central.id,
      branch_code: central.code, weekday: 3, start_time: '08:00:00', end_time: '12:30:00',
    });
  });

  it('deja una entrada de auditoría con quién lo hizo y la sucursal', async () => {
    const doctor = await newDoctor();
    const block = await makeBlock(doctor.id);
    const audit = await pool.query(
      `SELECT actor_id, branch_id, detail FROM audit_log
        WHERE entity_type = 'doctor_schedule' AND action = 'schedule_created' AND entity_id = $1`,
      [block.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_id).toBe(admin.id);
    expect(audit.rows[0].branch_id).toBe(central.id);
    expect(audit.rows[0].detail).toMatchObject({ doctor_id: doctor.id, weekday: FUTURE_WEEKDAY });
  });

  it.each([
    ['día 0', { weekday: 0 }],
    ['día 8', { weekday: 8 }],
    ['día con decimales', { weekday: 1.5 }],
    ['hora que no es en punto ni y media', { start_time: '08:15' }],
    ['hora con otro formato', { start_time: '8:00' }],
    ['hora 24:00', { end_time: '24:00' }],
    ['sin médico', { doctor_id: undefined }],
    ['médico que no es un uuid', { doctor_id: 'abc' }],
    ['sin sucursal', { branch_id: undefined }],
  ])('el esquema rechaza con 400: %s', async (_name, overrides) => {
    const doctor = await newDoctor();
    const body = {
      doctor_id: doctor.id, branch_id: central.id, weekday: 2, start_time: '08:00', end_time: '12:00', ...overrides,
    };
    const response = await create(body);
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Datos inválidos.'); // lo rechaza el esquema, antes de llegar a la base
  });

  it.each([
    ['fin antes del inicio', { start_time: '12:00', end_time: '08:00' }],
    ['fin igual al inicio', { start_time: '09:00', end_time: '09:00' }],
  ])('rechaza con 400: %s', async (_name, overrides) => {
    const doctor = await newDoctor();
    const response = await create({
      doctor_id: doctor.id, branch_id: central.id, weekday: 2, ...overrides,
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('La hora de inicio debe ser anterior a la de fin.');
  });

  it('rechaza a alguien que no es médico', async () => {
    const notDoctor = await createTestUser({ role: 'recepcionista', branchIds: [central.id] });
    const response = await create({
      doctor_id: notDoctor.id, branch_id: central.id, weekday: 2, start_time: '08:00', end_time: '12:00',
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('El usuario indicado no es un médico activo.');
  });

  it('rechaza a un médico desactivado y a un usuario que no existe', async () => {
    const inactive = await createTestUser({ role: 'doctor', branchIds: [central.id], isActive: false });
    for (const id of [inactive.id, randomUUID()]) {
      const response = await create({
        doctor_id: id, branch_id: central.id, weekday: 2, start_time: '08:00', end_time: '12:00',
      });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('El usuario indicado no es un médico activo.');
    }
  });

  it('rechaza una sucursal inactiva o que no existe', async () => {
    const inactiveBranch = await createTestBranch(false);
    const doctor = await newDoctor([inactiveBranch.id]);
    for (const branchId of [inactiveBranch.id, randomUUID()]) {
      const response = await create({
        doctor_id: doctor.id, branch_id: branchId, weekday: 2, start_time: '08:00', end_time: '12:00',
      });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('La sucursal indicada no existe o está inactiva.');
    }
  });

  it('rechaza una sucursal a la que el médico no está asignado', async () => {
    const doctor = await newDoctor([escalon.id]);
    const response = await create({
      doctor_id: doctor.id, branch_id: central.id, weekday: 2, start_time: '08:00', end_time: '12:00',
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('El médico no está asignado a esa sucursal.');
  });

  it.each([
    ['empieza antes de la apertura', '07:30', '10:00'],
    ['termina después del cierre', '15:00', '17:30'],
  ])('rechaza un bloque que %s de la sucursal', async (_name, start, end) => {
    const doctor = await newDoctor();
    const response = await create({
      doctor_id: doctor.id, branch_id: central.id, weekday: 2, start_time: start, end_time: end,
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('dentro del horario de la sucursal (08:00 a 17:00)');
  });

  it('acepta un bloque que ocupa todo el horario de la sucursal', async () => {
    const doctor = await newDoctor();
    await makeBlock(doctor.id, { start_time: '08:00', end_time: '17:00' });
  });
});

describe('Cruces entre bloques', () => {
  it('rechaza un bloque que se cruza con otro del mismo médico y día', async () => {
    const doctor = await newDoctor();
    await makeBlock(doctor.id, { start_time: '08:00', end_time: '12:00' });
    const response = await create({
      doctor_id: doctor.id, branch_id: central.id, weekday: FUTURE_WEEKDAY, start_time: '11:30', end_time: '13:00',
    });
    expect(response.status).toBe(409);
    expect(response.body.message).toContain('se cruza');
  });

  it('también se cruza con un bloque de otra sucursal', async () => {
    const doctor = await newDoctor();
    await makeBlock(doctor.id, { start_time: '08:00', end_time: '12:00' });
    const response = await create({
      doctor_id: doctor.id, branch_id: escalon.id, weekday: FUTURE_WEEKDAY, start_time: '10:00', end_time: '14:00',
    });
    expect(response.status).toBe(409);
  });

  it('permite bloques seguidos, de otro día y de otro médico', async () => {
    const doctor = await newDoctor();
    await makeBlock(doctor.id, { start_time: '08:00', end_time: '12:00' });
    await makeBlock(doctor.id, { start_time: '12:00', end_time: '14:00' });                   // seguido
    await makeBlock(doctor.id, { weekday: (FUTURE_WEEKDAY % 7) + 1 });                         // otro día
    await makeBlock((await newDoctor()).id);                                                   // otro médico
  });
});

describe('Ver los bloques', () => {
  it('lista los bloques del médico, ordenados por día y hora', async () => {
    const doctor = await newDoctor();
    await makeBlock(doctor.id, { weekday: 4, start_time: '13:00', end_time: '15:00' });
    await makeBlock(doctor.id, { weekday: 2, start_time: '09:00', end_time: '11:00' });
    await makeBlock(doctor.id, { weekday: 2, start_time: '14:00', end_time: '16:00' });
    const response = await request(app).get(`/api/horarios?doctor_id=${doctor.id}`).set(auth(admin.token));
    expect(response.status).toBe(200);
    expect(response.body.data.map((b: { weekday: number; start_time: string }) => `${b.weekday} ${b.start_time}`)).toEqual([
      '2 09:00:00', '2 14:00:00', '4 13:00:00',
    ]);
  });

  it('filtra por sucursal', async () => {
    const doctor = await newDoctor();
    await makeBlock(doctor.id, { branch_id: central.id, weekday: 1 });
    await makeBlock(doctor.id, { branch_id: escalon.id, weekday: 2 });
    const response = await request(app)
      .get(`/api/horarios?doctor_id=${doctor.id}&branch_id=${escalon.id}`).set(auth(admin.token));
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].branch_id).toBe(escalon.id);
  });

  it('la recepcionista solo ve los bloques de sus sucursales', async () => {
    const doctor = await newDoctor();
    await makeBlock(doctor.id, { branch_id: central.id, weekday: 1 });
    await makeBlock(doctor.id, { branch_id: escalon.id, weekday: 2 });
    const response = await request(app).get(`/api/horarios?doctor_id=${doctor.id}`).set(auth(receptionist.token));
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].branch_id).toBe(central.id);
  });

  it('pedir una sucursal ajena responde 403', async () => {
    const response = await request(app).get(`/api/horarios?branch_id=${escalon.id}`).set(auth(receptionist.token));
    expect(response.status).toBe(403);
  });

  it('un bloque de una sucursal ajena responde 404, y uno propio 200', async () => {
    const doctor = await newDoctor();
    const own = await makeBlock(doctor.id, { branch_id: central.id, weekday: 1 });
    const foreign = await makeBlock(doctor.id, { branch_id: escalon.id, weekday: 2 });
    expect((await request(app).get(`/api/horarios/${own.id}`).set(auth(receptionist.token))).status).toBe(200);
    expect((await request(app).get(`/api/horarios/${foreign.id}`).set(auth(receptionist.token))).status).toBe(404);
  });

  it('responde 404 si no existe y 400 si el id está mal escrito', async () => {
    expect((await request(app).get(`/api/horarios/${randomUUID()}`).set(auth(admin.token))).status).toBe(404);
    expect((await request(app).get('/api/horarios/no-es-un-uuid').set(auth(admin.token))).status).toBe(400);
  });
});

describe('Modificar un bloque', () => {
  it('cambia solo los campos enviados', async () => {
    const block = await makeBlock((await newDoctor()).id);
    const response = await patch(block.id, { end_time: '11:30' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ start_time: '08:00:00', end_time: '11:30:00' });
  });

  it('puede cambiar de día y de sucursal (si el médico está asignada ahí)', async () => {
    const block = await makeBlock((await newDoctor()).id);
    const response = await patch(block.id, { weekday: (FUTURE_WEEKDAY % 7) + 1, branch_id: escalon.id });
    expect(response.status).toBe(200);
    expect(response.body.data.branch_id).toBe(escalon.id);
  });

  it('no deja pasar a una sucursal a la que el médico no está asignado', async () => {
    const block = await makeBlock((await newDoctor([central.id])).id);
    expect((await patch(block.id, { branch_id: escalon.id })).status).toBe(400);
  });

  it('modificar solo un extremo se compara con el valor guardado', async () => {
    const block = await makeBlock((await newDoctor()).id, { start_time: '09:00', end_time: '12:00' });
    expect((await patch(block.id, { start_time: '12:00' })).status).toBe(400);
    expect((await patch(block.id, { end_time: '08:30' })).status).toBe(400);
  });

  it.each([
    ['cuerpo vacío', {}],
    ['hora sin formato', { end_time: '11:10' }],
    ['día inválido', { weekday: 9 }],
    ['fuera del horario de la sucursal', { end_time: '18:00' }],
  ])('rechaza con 400: %s', async (_name, body) => {
    const block = await makeBlock((await newDoctor()).id);
    expect((await patch(block.id, body)).status).toBe(400);
  });

  it('un cuerpo vacío explica que falta indicar un campo', async () => {
    const block = await makeBlock((await newDoctor()).id);
    const response = await patch(block.id, {});
    expect(response.body.errors[0].message).toBe('Indique al menos un campo para modificar');
  });

  it('responde 409 si el cambio lo cruza con otro bloque del médico', async () => {
    const doctor = await newDoctor();
    await makeBlock(doctor.id, { start_time: '08:00', end_time: '10:00' });
    const second = await makeBlock(doctor.id, { start_time: '10:00', end_time: '12:00' });
    expect((await patch(second.id, { start_time: '09:30' })).status).toBe(409);
  });

  it('el médico del bloque no se puede cambiar', async () => {
    const doctor = await newDoctor();
    const other = await newDoctor();
    const block = await makeBlock(doctor.id);
    await patch(block.id, { doctor_id: other.id, end_time: '11:00' });
    const after = await request(app).get(`/api/horarios/${block.id}`).set(auth(admin.token));
    expect(after.body.data.doctor_id).toBe(doctor.id);
  });

  it('responde 404 si el bloque no existe', async () => {
    expect((await patch(randomUUID(), { end_time: '11:00' })).status).toBe(404);
  });

  it('audita los campos que cambiaron, con su valor anterior y el nuevo', async () => {
    const block = await makeBlock((await newDoctor()).id);
    await patch(block.id, { end_time: '11:00' });
    const audit = await pool.query(
      `SELECT actor_id, branch_id, detail FROM audit_log
        WHERE entity_type = 'doctor_schedule' AND action = 'schedule_updated' AND entity_id = $1`,
      [block.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_id).toBe(admin.id);
    expect(audit.rows[0].branch_id).toBe(central.id);
    expect(audit.rows[0].detail.end_time).toEqual({ from: '12:00', to: '11:00' });
    expect(audit.rows[0].detail.start_time).toBeUndefined();
  });

  it('si no cambia nada, no deja auditoría', async () => {
    const block = await makeBlock((await newDoctor()).id);
    expect((await patch(block.id, { start_time: '08:00', end_time: '12:00' })).status).toBe(200);
    const audit = await pool.query(
      `SELECT 1 FROM audit_log WHERE action = 'schedule_updated' AND entity_id = $1`,
      [block.id],
    );
    expect(audit.rows).toHaveLength(0);
  });
});

describe('Borrar un bloque', () => {
  const remove = (id: string) => request(app).delete(`/api/horarios/${id}`).set(auth(admin.token));

  it('borra el bloque y deja auditoría', async () => {
    const block = await makeBlock((await newDoctor()).id);
    expect((await remove(block.id)).status).toBe(200);
    expect((await request(app).get(`/api/horarios/${block.id}`).set(auth(admin.token))).status).toBe(404);
    const audit = await pool.query(
      `SELECT branch_id, detail FROM audit_log WHERE action = 'schedule_deleted' AND entity_id = $1`,
      [block.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].branch_id).toBe(central.id);
    expect(audit.rows[0].detail).toMatchObject({ start_time: '08:00', end_time: '12:00' });
  });

  it('responde 404 si no existe y 400 si el id está mal escrito', async () => {
    expect((await remove(randomUUID())).status).toBe(404);
    expect((await remove('no-es-un-uuid')).status).toBe(400);
  });
});

describe('Protección de las citas agendadas', () => {
  it('no deja borrar un bloque que tiene una cita agendada futura', async () => {
    const doctor = await newDoctor();
    const block = await makeBlock(doctor.id);
    await bookFuture(doctor.id, '09:00');
    const response = await request(app).delete(`/api/horarios/${block.id}`).set(auth(admin.token));
    expect(response.status).toBe(409);
    expect(response.body.message).toContain('Hay 1 cita(s) agendada(s)');
  });

  it('no deja achicar el bloque dejando la cita fuera', async () => {
    const doctor = await newDoctor();
    const block = await makeBlock(doctor.id);
    await bookFuture(doctor.id, '08:00');
    expect((await patch(block.id, { start_time: '08:30' })).status).toBe(409);
    expect((await patch(block.id, { end_time: '08:30' })).status).toBe(200);
  });

  it('cuenta todas las citas que quedarían fuera', async () => {
    const doctor = await newDoctor();
    const block = await makeBlock(doctor.id);
    await bookFuture(doctor.id, '10:00');
    await bookFuture(doctor.id, '11:30');
    const response = await patch(block.id, { end_time: '10:00' });
    expect(response.status).toBe(409);
    expect(response.body.message).toContain('Hay 2 cita(s)');
  });

  it('deja agrandar el bloque o achicarlo sin tocar las citas', async () => {
    const doctor = await newDoctor();
    const block = await makeBlock(doctor.id);
    await bookFuture(doctor.id, '09:00');
    expect((await patch(block.id, { end_time: '13:00' })).status).toBe(200);
    expect((await patch(block.id, { start_time: '09:00', end_time: '09:30' })).status).toBe(200);
  });

  it('no deja mover el bloque a otro día ni a otra sucursal', async () => {
    const doctor = await newDoctor();
    const block = await makeBlock(doctor.id);
    await bookFuture(doctor.id, '09:00');
    expect((await patch(block.id, { weekday: (FUTURE_WEEKDAY % 7) + 1 })).status).toBe(409);
    expect((await patch(block.id, { branch_id: escalon.id })).status).toBe(409);
  });

  it('las citas canceladas o ya atendidas no impiden el cambio', async () => {
    const doctor = await newDoctor();
    const block = await makeBlock(doctor.id);
    await bookFuture(doctor.id, '08:00', 'cancelled');
    await bookFuture(doctor.id, '08:30', 'completed');
    expect((await patch(block.id, { start_time: '10:00' })).status).toBe(200);
  });

  it('las citas de otro día, otra sucursal o pasadas no impiden el cambio', async () => {
    const doctor = await newDoctor();
    const block = await makeBlock(doctor.id);
    const patient = await createTestPatient();
    // Otro día de la semana (cae fuera del bloque).
    await insertAppointment({
      patientId: patient.id, doctorId: doctor.id, branchId: central.id, createdBy: receptionist.id,
      startsAt: '2030-03-05 09:00',
    });
    // Misma hora y día, pero en la otra sucursal.
    const patient2 = await createTestPatient();
    await insertAppointment({
      patientId: patient2.id, doctorId: doctor.id, branchId: escalon.id, createdBy: receptionist.id,
      startsAt: `${FUTURE_DATE} 14:00`,
    });
    // Una cita pasada, en el bloque.
    const patient3 = await createTestPatient();
    await insertAppointment({
      patientId: patient3.id, doctorId: doctor.id, branchId: central.id, createdBy: receptionist.id,
      startsAt: '2020-01-06 09:00', // lunes del pasado
    });
    expect((await request(app).delete(`/api/horarios/${block.id}`).set(auth(admin.token))).status).toBe(200);
  });
});
