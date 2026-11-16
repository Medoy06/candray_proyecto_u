// =============================================================================
// recordatorios.prueba.ts
// Qué prueba:   la bandeja de recordatorios simulados (GET /api/recordatorios):
//               quién puede verla, que incluya solo las citas agendadas de la
//               sucursal activa desde ahora hasta el final de mañana, en orden,
//               y que traiga lo necesario para armar el mensaje.
// Cómo:         llama a la API real (supertest) sobre la base candray_test.
// Depende de:   app.ts, servicios/recordatorios.ts y las ayudas de prueba.
// =============================================================================
import { randomUUID } from 'crypto';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import type { Role } from '../../src/configuracion/roles';
import { nowInElSalvador, todayInElSalvador } from '../../src/utilidades/fechas';
import { signToken } from '../../src/utilidades/token';
import { createTestPatient, insertAppointment } from '../ayudas/datosClinicos';
import { createTestBranch, createTestUser, type TestBranch } from '../ayudas/datosPrueba';

const app = createApp();

async function actor(role: Role, branchIds: string[] = []) {
  const user = await createTestUser({ role, branchIds });
  return { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

const TODAY = todayInElSalvador();
const TOMORROW = addDays(TODAY, 1);

// La hora de ahora en El Salvador movida `hours` horas, como 'AAAA-MM-DD HH:MM'
// y redondeada hacia abajo a la media hora (las citas empiezan en :00 o :30).
// Así la prueba funciona a cualquier hora del día, también cerca de la medianoche.
function fromNow(hours: number): string {
  const moved = new Date(`${nowInElSalvador().replace(' ', 'T')}:00Z`);
  moved.setUTCHours(moved.getUTCHours() + hours);
  moved.setUTCMinutes(Math.floor(moved.getUTCMinutes() / 30) * 30);
  return moved.toISOString().slice(0, 16).replace('T', ' ');
}

describe('permisos', () => {
  it('sin sesión: 401', async () => {
    expect((await request(app).get('/api/recordatorios')).status).toBe(401);
  });

  it.each(['doctor', 'encargado_venta', 'directivo'] as const)('%s no ve la bandeja: 403', async (role) => {
    const branch = await createTestBranch();
    const user = await actor(role, role === 'directivo' ? [] : [branch.id]);
    expect((await request(app).get('/api/recordatorios').set(auth(user.token))).status).toBe(403);
  });

  it.each(['recepcionista', 'admin'] as const)('%s sí la ve', async (role) => {
    const branch = await createTestBranch();
    const user = await actor(role, [branch.id]);
    const response = await request(app).get('/api/recordatorios').set(auth(user.token));
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });
});

describe('qué citas entran', () => {
  let branch: TestBranch;
  let other: TestBranch;
  let receptionist: Awaited<ReturnType<typeof actor>>;
  let doctor: Awaited<ReturnType<typeof actor>>;
  let ids: Record<string, string>;
  let patientName: string;

  beforeAll(async () => {
    branch = await createTestBranch();
    other = await createTestBranch();
    receptionist = await actor('recepcionista', [branch.id, other.id]);
    doctor = await actor('doctor', [branch.id, other.id]);
    ids = {};

    // Cada cita con su propio paciente: un paciente no puede tener dos citas a la vez.
    const book = async (key: string, startsAt: string, status: 'scheduled' | 'completed' | 'cancelled' | 'no_show', where = branch) => {
      const isTheChecked = key === 'tomorrowMorning';
      if (isTheChecked) patientName = `Paciente Recordatorio ${randomUUID().slice(0, 8)}`;
      const patient = await createTestPatient(isTheChecked ? { full_name: patientName, phone: '7123-4567' } : {});
      ids[key] = (
        await insertAppointment({
          patientId: patient.id, doctorId: doctor.id, branchId: where.id, createdBy: receptionist.id, startsAt, status,
          cancellationReason: status === 'cancelled' ? 'Motivo' : null,
        })
      ).rows[0].id;
    };

    await book('tomorrowEvening', `${TOMORROW} 16:00`, 'scheduled');
    await book('tomorrowMorning', `${TOMORROW} 09:00`, 'scheduled');
    await book('soon', fromNow(2), 'scheduled');
    // Las que NO entran:
    await book('earlier', fromNow(-2), 'scheduled');
    await book('yesterday', `${addDays(TODAY, -1)} 10:00`, 'scheduled');
    await book('inTwoDays', `${addDays(TODAY, 2)} 08:00`, 'scheduled');
    await book('cancelled', `${TOMORROW} 10:00`, 'cancelled');
    await book('completed', `${TOMORROW} 11:00`, 'completed');
    await book('noShow', `${TOMORROW} 12:00`, 'no_show');
    await book('otherBranch', `${TOMORROW} 13:00`, 'scheduled', other);
  });

  const list = async (headers: Record<string, string> = {}) => {
    const response = await request(app).get('/api/recordatorios').set(auth(receptionist.token)).set(headers);
    expect(response.status).toBe(200);
    return response.body.data as Array<Record<string, string>>;
  };

  it('trae solo las citas agendadas de hoy (desde ahora, no las de hace horas) y de mañana, de la sucursal activa', async () => {
    const found = (await list()).map((row) => row.appointment_id);
    expect(found.sort()).toEqual([ids.tomorrowEvening, ids.tomorrowMorning, ids.soon].sort());
  });

  it('van de la más próxima a la más lejana', async () => {
    const found = (await list()).map((row) => row.appointment_id);
    expect(found).toEqual([ids.soon, ids.tomorrowMorning, ids.tomorrowEvening]);
  });

  it('cada una trae lo necesario para el mensaje: hora, paciente, teléfono, médico y sucursal', async () => {
    const row = (await list()).find((item) => item.appointment_id === ids.tomorrowMorning)!;
    expect(row).toEqual({
      appointment_id: ids.tomorrowMorning,
      starts_at: `${TOMORROW} 09:00:00`,
      patient_name: patientName,
      patient_phone: '7123-4567',
      doctor_name: 'Usuario de Prueba',
      branch_name: `Sucursal ${branch.code}`,
    });
  });

  it('con otra sucursal activa, muestra las de esa sucursal', async () => {
    const found = (await list({ 'X-Sucursal-Id': other.id })).map((row) => row.appointment_id);
    expect(found).toEqual([ids.otherBranch]);
  });

  it('una sucursal a la que no pertenece: 403', async () => {
    const stranger = await createTestBranch();
    const response = await request(app).get('/api/recordatorios').set(auth(receptionist.token)).set({ 'X-Sucursal-Id': stranger.id });
    expect(response.status).toBe(403);
  });
});
