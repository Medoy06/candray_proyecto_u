// =============================================================================
// consultasPendientes.prueba.ts
// Qué prueba:   GET /api/pacientes/:id/expediente/pendientes: las citas del
//               médico con el paciente que todavía no tienen nota. La pantalla
//               las usa para ofrecer solo citas en las que SÍ se puede escribir.
// Cómo:         llama a la API real (supertest) sobre la base candray_test.
// Depende de:   app.ts y las ayudas de prueba.
// =============================================================================
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { Role } from '../../src/configuracion/roles';
import { signToken } from '../../src/utilidades/token';
import { createTestPatient, insertAppointment, insertMedicalRecord } from '../ayudas/datosClinicos';
import { createTestBranch, createTestUser, type TestBranch } from '../ayudas/datosPrueba';

const app = createApp();

async function actor(role: Role, branchIds: string[] = []) {
  const user = await createTestUser({ role, branchIds });
  return { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
}
type Actor = Awaited<ReturnType<typeof actor>>;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const pending = (patientId: string, token: string) =>
  request(app).get(`/api/pacientes/${patientId}/expediente/pendientes`).set(auth(token));

let central: TestBranch;
let receptionist: Actor;

beforeAll(async () => {
  central = await createTestBranch();
  receptionist = await actor('recepcionista', [central.id]);
});

afterEach(() => {
  vi.useRealTimers();
});

// "Hoy" fijo para que las citas de hoy, de ayer y de mañana sean predecibles.
function freezeToday() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2031-06-15T10:00:00-06:00'));
}

const book = (doctor: Actor, patientId: string, startsAt: string, extra: Record<string, unknown> = {}) =>
  insertAppointment({
    patientId, doctorId: doctor.id, branchId: central.id, createdBy: receptionist.id, startsAt, ...extra,
  });

describe('consultas sin nota', () => {
  it('ofrece las citas de hoy y de antes, la más reciente primero, con sucursal y motivo', async () => {
    freezeToday();
    const doctor = await actor('doctor', [central.id]);
    const patient = await createTestPatient();
    const yesterday = (await book(doctor, patient.id, '2031-06-14 09:00', { reason: 'Control' })).rows[0].id;
    const today = (await book(doctor, patient.id, '2031-06-15 16:30')).rows[0].id;
    const old = (await book(doctor, patient.id, '2031-05-01 08:00')).rows[0].id;

    const response = await pending(patient.id, doctor.token);
    expect(response.status).toBe(200);
    expect(response.body.data.map((row: { id: string }) => row.id)).toEqual([today, yesterday, old]);
    expect(response.body.data[1]).toMatchObject({ id: yesterday, branch_name: expect.stringContaining('Sucursal'), reason: 'Control' });
    expect(response.body.data[1].starts_at).toMatch(/^2031-06-14 09:00/);
  });

  it('no ofrece las futuras, las canceladas, las de ausencia ni las que ya tienen nota', async () => {
    freezeToday();
    const doctor = await actor('doctor', [central.id]);
    const patient = await createTestPatient();
    await book(doctor, patient.id, '2031-06-16 08:00'); // mañana
    await book(doctor, patient.id, '2031-06-10 08:00', { status: 'cancelled', cancellationReason: 'Cancelada' });
    await book(doctor, patient.id, '2031-06-11 08:00', { status: 'no_show' });
    const noted = (await book(doctor, patient.id, '2031-06-12 08:00', { status: 'completed' })).rows[0].id;
    await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, appointmentId: noted });
    const open = (await book(doctor, patient.id, '2031-06-13 08:00', { status: 'completed' })).rows[0].id;

    const response = await pending(patient.id, doctor.token);
    expect(response.body.data.map((row: { id: string }) => row.id)).toEqual([open]);
  });

  it('solo las citas de ese paciente y de ese médico', async () => {
    freezeToday();
    const doctor = await actor('doctor', [central.id]);
    const other = await actor('doctor', [central.id]);
    const patient = await createTestPatient();
    const anotherPatient = await createTestPatient();
    const mine = (await book(doctor, patient.id, '2031-06-10 08:00')).rows[0].id;
    await book(other, patient.id, '2031-06-11 08:00'); // de otro médico
    await book(doctor, anotherPatient.id, '2031-06-12 08:00'); // de otro paciente

    const response = await pending(patient.id, doctor.token);
    expect(response.body.data.map((row: { id: string }) => row.id)).toEqual([mine]);
  });

  it('la cita de las 23:30 de hoy cuenta como hoy (el día se compara completo)', async () => {
    freezeToday();
    const doctor = await actor('doctor', [central.id]);
    const patient = await createTestPatient();
    const late = (await book(doctor, patient.id, '2031-06-15 23:30')).rows[0].id;
    expect((await pending(patient.id, doctor.token)).body.data.map((row: { id: string }) => row.id)).toEqual([late]);
  });

  it('sin citas: lista vacía', async () => {
    const doctor = await actor('doctor', [central.id]);
    const patient = await createTestPatient();
    const response = await pending(patient.id, doctor.token);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });
});

describe('quién puede pedirlas', () => {
  it('sin token: 401', async () => {
    const patient = await createTestPatient();
    expect((await request(app).get(`/api/pacientes/${patient.id}/expediente/pendientes`)).status).toBe(401);
  });

  it.each(['recepcionista', 'encargado_venta', 'directivo'] as const)(
    '%s no tiene la capacidad de escribir notas: lo frena la ruta (403)',
    async (role) => {
      const patient = await createTestPatient();
      const user = await actor(role, [central.id]);
      const response = await pending(patient.id, user.token);
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('No tiene permisos para realizar esta acción.');
    },
  );

  it('el administrador de demostración pasa la ruta, pero el servicio lo frena: las notas son del médico (403)', async () => {
    const patient = await createTestPatient();
    const admin = await actor('admin');
    const response = await pending(patient.id, admin.token);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Solo el médico que atendió la consulta puede escribir en el expediente.');
  });

  it('paciente inexistente: 404; identificador mal escrito: 400', async () => {
    const doctor = await actor('doctor', [central.id]);
    expect((await pending('00000000-0000-0000-0000-000000000000', doctor.token)).status).toBe(404);
    expect((await pending('no-es-un-uuid', doctor.token)).status).toBe(400);
  });

  it('coincide con lo que la API de escritura acepta: toda cita ofrecida admite su nota', async () => {
    freezeToday();
    const doctor = await actor('doctor', [central.id]);
    const patient = await createTestPatient();
    await book(doctor, patient.id, '2031-06-14 09:00');
    const [offered] = (await pending(patient.id, doctor.token)).body.data;
    const written = await request(app)
      .post(`/api/pacientes/${patient.id}/expediente`)
      .set(auth(doctor.token))
      .send({ appointment_id: offered.id, diagnosis: 'Miopía' });
    expect(written.status).toBe(201);
    expect((await pending(patient.id, doctor.token)).body.data).toEqual([]);
  });
});
