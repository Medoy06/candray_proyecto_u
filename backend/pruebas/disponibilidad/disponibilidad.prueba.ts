// =============================================================================
// disponibilidad.prueba.ts
// Qué prueba:   la consulta de disponibilidad de médicos: franjas libres,
//               ocupadas y pasadas, el médico itinerante, médicos que no
//               cuentan (inactivos, sin asignación), la sucursal activa y los
//               permisos por rol.
// Cómo:         llama a la API real (supertest) sobre la base candray_test, y al
//               servicio directamente cuando hay que fijar la "hora actual".
// Depende de:   app.ts, servicios/disponibilidad.ts y las ayudas de prueba.
// =============================================================================
import { randomUUID } from 'crypto';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import type { Role } from '../../src/configuracion/roles';
import { getDayAvailability } from '../../src/servicios/disponibilidad';
import { isoWeekday, nowInElSalvador, todayInElSalvador } from '../../src/utilidades/fechas';
import { signToken } from '../../src/utilidades/token';
import { createTestPatient, insertAppointment, insertSchedule } from '../ayudas/datosClinicos';
import { createTestBranch, createTestUser, type TestBranch } from '../ayudas/datosPrueba';

const app = createApp();

async function actor(role: Role, branchIds: string[] = []) {
  const user = await createTestUser({ role, branchIds });
  return { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const DATE = '2030-03-06';                 // una fecha futura fija
const WEEKDAY = isoWeekday(DATE);
const PAST_DATE = '2020-01-08';            // una fecha pasada fija
const PAST_WEEKDAY = isoWeekday(PAST_DATE);

let central: TestBranch;
let escalon: TestBranch;
let receptionist: Awaited<ReturnType<typeof actor>>;

beforeAll(async () => {
  central = await createTestBranch();
  escalon = await createTestBranch();
  receptionist = await actor('recepcionista', [central.id]);
});

// Un médico asignado a las sucursales indicadas, con bloques ya creados.
async function doctorWithBlocks(
  blocks: { branchId?: string; weekday?: number; start: string; end: string }[],
  branchIds = [central.id, escalon.id],
) {
  const doctor = await createTestUser({ role: 'doctor', branchIds });
  for (const block of blocks) {
    await insertSchedule({
      doctorId: doctor.id, branchId: block.branchId ?? central.id,
      weekday: block.weekday ?? WEEKDAY, start: block.start, end: block.end,
    });
  }
  return doctor;
}

// Agenda una cita de ese médico.
async function book(
  doctorId: string, time: string,
  options: { date?: string; branchId?: string; status?: 'scheduled' | 'cancelled' | 'completed' | 'no_show' } = {},
) {
  const patient = await createTestPatient();
  await insertAppointment({
    patientId: patient.id, doctorId, branchId: options.branchId ?? central.id,
    createdBy: receptionist.id, startsAt: `${options.date ?? DATE} ${time}`, status: options.status,
  });
}

const query = (params: string, token = receptionist.token, branchHeader?: string) => {
  const req = request(app).get(`/api/disponibilidad?${params}`).set(auth(token));
  return branchHeader ? req.set('X-Sucursal-Id', branchHeader) : req;
};

// Devuelve la disponibilidad de UN médico en la sucursal Central.
async function availabilityOf(doctorId: string, date = DATE) {
  const response = await query(`date=${date}&doctor_id=${doctorId}`);
  expect(response.status).toBe(200);
  return response.body.data.doctors[0] as {
    doctor_id: string; doctor_name: string; free_count: number;
    blocks: { start_time: string; end_time: string }[];
    slots: { time: string; status: string }[];
  };
}

const statuses = (doctor: { slots: { time: string; status: string }[] }) =>
  Object.fromEntries(doctor.slots.map((slot) => [slot.time, slot.status]));

describe('Permisos de /api/disponibilidad', () => {
  it('sin token responde 401', async () => {
    expect((await request(app).get(`/api/disponibilidad?date=${DATE}`)).status).toBe(401);
  });

  it.each(['encargado_venta', 'directivo'] as Role[])('%s recibe 403', async (role) => {
    const { token } = await actor(role, role === 'directivo' ? [] : [central.id]);
    expect((await query(`date=${DATE}`, token)).status).toBe(403);
  });

  it.each(['doctor', 'recepcionista', 'admin'] as Role[])('%s puede consultar', async (role) => {
    const { token } = await actor(role, [central.id]);
    expect((await query(`date=${DATE}`, token)).status).toBe(200);
  });
});

describe('Franjas de un médico', () => {
  it('un bloque de 8:00 a 10:00 da cuatro franjas libres', async () => {
    const doctor = await doctorWithBlocks([{ start: '08:00', end: '10:00' }]);
    const data = await availabilityOf(doctor.id);
    expect(data.slots.map((slot) => slot.time)).toEqual(['08:00', '08:30', '09:00', '09:30']);
    expect(data.slots.every((slot) => slot.status === 'free')).toBe(true);
    expect(data.free_count).toBe(4);
    expect(data.blocks).toEqual([{ start_time: '08:00', end_time: '10:00' }]);
  });

  it('devuelve la fecha, la sucursal y el día de la semana', async () => {
    const doctor = await doctorWithBlocks([{ start: '08:00', end: '09:00' }]);
    const response = await query(`date=${DATE}&doctor_id=${doctor.id}`);
    expect(response.body.data).toMatchObject({ date: DATE, branch_id: central.id, weekday: WEEKDAY });
  });

  it('une las franjas de varios bloques del mismo día', async () => {
    const doctor = await doctorWithBlocks([{ start: '08:00', end: '09:00' }, { start: '10:00', end: '11:00' }]);
    const data = await availabilityOf(doctor.id);
    expect(data.slots.map((slot) => slot.time)).toEqual(['08:00', '08:30', '10:00', '10:30']);
    expect(data.blocks).toHaveLength(2);
  });

  it('una cita agendada deja esa franja ocupada y las demás libres', async () => {
    const doctor = await doctorWithBlocks([{ start: '08:00', end: '10:00' }]);
    await book(doctor.id, '08:30');
    const data = await availabilityOf(doctor.id);
    expect(statuses(data)).toEqual({ '08:00': 'free', '08:30': 'booked', '09:00': 'free', '09:30': 'free' });
    expect(data.free_count).toBe(3);
  });

  it.each(['scheduled', 'completed', 'no_show'] as const)('una cita en estado %s ocupa la franja', async (status) => {
    const doctor = await doctorWithBlocks([{ start: '08:00', end: '09:00' }]);
    await book(doctor.id, '08:00', { status });
    expect(statuses(await availabilityOf(doctor.id))['08:00']).toBe('booked');
  });

  it('una cita cancelada deja la franja libre', async () => {
    const doctor = await doctorWithBlocks([{ start: '08:00', end: '09:00' }]);
    await book(doctor.id, '08:00', { status: 'cancelled' });
    expect(statuses(await availabilityOf(doctor.id))['08:00']).toBe('free');
  });

  it('una cita en otra fecha no afecta', async () => {
    const doctor = await doctorWithBlocks([{ start: '08:00', end: '09:00' }]);
    await book(doctor.id, '08:00', { date: '2030-03-13' }); // una semana después
    expect(statuses(await availabilityOf(doctor.id))['08:00']).toBe('free');
  });

  it('el médico itinerante: una cita en la OTRA sucursal ocupa la franja aquí', async () => {
    const doctor = await doctorWithBlocks([
      { branchId: central.id, start: '08:00', end: '10:00' },
    ]);
    // El mismo médico tiene la tarde en Escalón, y a las 8:00 una cita allá (sin bloque, para el caso).
    await book(doctor.id, '08:00', { branchId: escalon.id });
    expect(statuses(await availabilityOf(doctor.id))['08:00']).toBe('booked');
  });
});

describe('Franjas pasadas', () => {
  it('en un día pasado, lo libre pasa a "past" y lo ocupado sigue ocupado', async () => {
    const doctor = await doctorWithBlocks([{ weekday: PAST_WEEKDAY, start: '08:00', end: '09:30' }]);
    await book(doctor.id, '08:30', { date: PAST_DATE });
    const data = await availabilityOf(doctor.id, PAST_DATE);
    expect(statuses(data)).toEqual({ '08:00': 'past', '08:30': 'booked', '09:00': 'past' });
    expect(data.free_count).toBe(0);
  });

  it('con una hora actual fijada, lo que ya empezó es "past" y lo que viene es "free"', async () => {
    const doctor = await doctorWithBlocks([{ start: '08:00', end: '10:00' }]);
    const result = await getDayAvailability(DATE, central.id, doctor.id, `${DATE} 09:00`);
    const slots = Object.fromEntries(result.doctors[0].slots.map((slot) => [slot.time, slot.status]));
    // La franja de las 9:00 ya empezó (la hora actual es justo 9:00): no se puede agendar.
    expect(slots).toEqual({ '08:00': 'past', '08:30': 'past', '09:00': 'past', '09:30': 'free' });
    expect(result.doctors[0].free_count).toBe(1);
  });

  it('con la hora real de hoy, las franjas anteriores a ahora son "past" y las siguientes "free"', async () => {
    const today = todayInElSalvador();
    const weekday = isoWeekday(today);
    const doctor = await doctorWithBlocks([{ weekday, start: '08:00', end: '17:00' }]);
    const data = await availabilityOf(doctor.id, today);
    const now = nowInElSalvador();
    for (const slot of data.slots) {
      expect(slot.status).toBe(`${today} ${slot.time}` <= now ? 'past' : 'free');
    }
  });
});

describe('Qué médicos aparecen', () => {
  it('no aparece un médico desactivado', async () => {
    const doctor = await doctorWithBlocks([{ start: '08:00', end: '09:00' }]);
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [doctor.id]);
    const response = await query(`date=${DATE}&doctor_id=${doctor.id}`);
    expect(response.body.data.doctors).toEqual([]);
  });

  it('no aparece un médico al que le quitaron la sucursal', async () => {
    const doctor = await doctorWithBlocks([{ start: '08:00', end: '09:00' }]);
    await pool.query('DELETE FROM user_branches WHERE user_id = $1 AND branch_id = $2', [doctor.id, central.id]);
    const response = await query(`date=${DATE}&doctor_id=${doctor.id}`);
    expect(response.body.data.doctors).toEqual([]);
  });

  it('no aparece alguien que ya no es médico', async () => {
    const doctor = await doctorWithBlocks([{ start: '08:00', end: '09:00' }]);
    await pool.query(`UPDATE users SET role = 'recepcionista' WHERE id = $1`, [doctor.id]);
    expect((await query(`date=${DATE}&doctor_id=${doctor.id}`)).body.data.doctors).toEqual([]);
  });

  it('no aparece si su bloque es de otro día de la semana', async () => {
    const doctor = await doctorWithBlocks([{ weekday: (WEEKDAY % 7) + 1, start: '08:00', end: '09:00' }]);
    expect((await query(`date=${DATE}&doctor_id=${doctor.id}`)).body.data.doctors).toEqual([]);
  });

  it('solo aparecen los bloques de la sucursal consultada', async () => {
    const doctor = await doctorWithBlocks([{ branchId: escalon.id, start: '08:00', end: '09:00' }]);
    expect((await query(`date=${DATE}&doctor_id=${doctor.id}`)).body.data.doctors).toEqual([]);
    const admin = await actor('admin', [central.id]);
    const inEscalon = await query(`date=${DATE}&doctor_id=${doctor.id}&branch_id=${escalon.id}`, admin.token);
    expect(inEscalon.body.data.doctors).toHaveLength(1);
  });

  it('lista a los médicos por nombre, cada uno con sus franjas', async () => {
    const suffix = randomUUID().slice(0, 6);
    const second = await doctorWithBlocks([{ start: '08:00', end: '09:00' }], [central.id]);
    const first = await doctorWithBlocks([{ start: '09:00', end: '10:00' }], [central.id]);
    await pool.query('UPDATE users SET full_name = $2 WHERE id = $1', [first.id, `Aaa ${suffix}`]);
    await pool.query('UPDATE users SET full_name = $2 WHERE id = $1', [second.id, `Bbb ${suffix}`]);
    const response = await query(`date=${DATE}`);
    const names = (response.body.data.doctors as { doctor_name: string }[])
      .map((doctor) => doctor.doctor_name)
      .filter((name) => name.endsWith(suffix));
    expect(names).toEqual([`Aaa ${suffix}`, `Bbb ${suffix}`]);
  });

  it('sin filtro de médico aparecen todos los de la sucursal ese día', async () => {
    const one = await doctorWithBlocks([{ start: '08:00', end: '09:00' }], [central.id]);
    const two = await doctorWithBlocks([{ start: '08:00', end: '09:00' }], [central.id]);
    const ids = (await query(`date=${DATE}`)).body.data.doctors.map((doctor: { doctor_id: string }) => doctor.doctor_id);
    expect(ids).toEqual(expect.arrayContaining([one.id, two.id]));
  });
});

describe('Sucursal consultada', () => {
  it('sin branch_id usa la sucursal activa, que se cambia con la cabecera X-Sucursal-Id', async () => {
    const doctor = await doctorWithBlocks([{ branchId: escalon.id, start: '08:00', end: '09:00' }]);
    const worker = await actor('recepcionista', [central.id, escalon.id]);
    const inCentral = await query(`date=${DATE}&doctor_id=${doctor.id}`, worker.token);
    const inEscalon = await query(`date=${DATE}&doctor_id=${doctor.id}`, worker.token, escalon.id);
    expect(inCentral.body.data.doctors).toEqual([]);
    expect(inEscalon.body.data.doctors).toHaveLength(1);
    expect(inEscalon.body.data.branch_id).toBe(escalon.id);
  });

  it('branch_id de una sucursal ajena responde 403', async () => {
    expect((await query(`date=${DATE}&branch_id=${escalon.id}`)).status).toBe(403);
  });

  it('un branch_id propio funciona', async () => {
    expect((await query(`date=${DATE}&branch_id=${central.id}`)).status).toBe(200);
  });
});

describe('Filtros inválidos', () => {
  it.each([
    ['sin fecha', ''],
    ['fecha con otro formato', 'date=06/03/2030'],
    ['fecha que no existe', 'date=2030-02-31'],
    ['médico que no es uuid', `date=${DATE}&doctor_id=abc`],
    ['sucursal que no es uuid', `date=${DATE}&branch_id=abc`],
  ])('rechaza con 400: %s', async (_name, params) => {
    expect((await query(params)).status).toBe(400);
  });
});
