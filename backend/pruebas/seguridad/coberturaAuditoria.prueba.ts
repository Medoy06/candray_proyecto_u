// =============================================================================
// coberturaAuditoria.prueba.ts
// Qué prueba:   la revisión de seguridad de la bitácora. Que CADA acción que
//               cambia datos, o que lee o niega acceso a datos sensibles, deje
//               exactamente UNA entrada en audit_log con quién la hizo (y la
//               sucursal cuando corresponde), y que la bitácora nunca guarde
//               contraseñas ni hashes.
// Cómo:         ejecuta cada acción por la API real y cuenta las entradas de esa
//               acción hechas por ese usuario antes y después. Dos pruebas de
//               "completitud" fallan si se agrega una ruta que cambia datos o
//               una acción de auditoría nueva sin cubrirla aquí.
// Depende de:   app.ts, rutas/*.ts (descubiertas), las ayudas de prueba.
// =============================================================================
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import type { Role } from '../../src/configuracion/roles';
import { todayInElSalvador } from '../../src/utilidades/fechas';
import { signToken } from '../../src/utilidades/token';
import { createTestBranch, createTestUser, TEST_PASSWORD, type TestBranch } from '../ayudas/datosPrueba';
import {
  createTestPatient, insertAppointment, insertMedicalRecord, insertPrescription,
} from '../ayudas/datosClinicos';
import { DISCOVERED } from '../ayudas/rutasApi';

const app = createApp();
const exercised = new Set<string>();

interface Actor { id: string; email: string; token: string }
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function actor(role: Role, branchIds: string[] = []): Promise<Actor> {
  const user = await createTestUser({ role, branchIds });
  return { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
}

async function countOf(action: string, actorId: string | null): Promise<number> {
  const result = await pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM audit_log WHERE action = $1 AND actor_id IS NOT DISTINCT FROM $2',
    [action, actorId],
  );
  return result.rows[0].n;
}

// Ejecuta una acción y exige que deje EXACTAMENTE una entrada nueva de `action`
// hecha por `by`. Si se indica `branchId`, la entrada debe llevar esa sucursal.
async function expectAudited(
  action: string,
  by: Actor,
  run: () => PromiseLike<{ status: number; body: unknown }>,
  expected: { status: number; branchId?: string },
): Promise<void> {
  const before = await countOf(action, by.id);
  const response = await run();
  expect(response.status, `${action}: ${JSON.stringify(response.body)}`).toBe(expected.status);
  expect(await countOf(action, by.id), `${action} debe dejar exactamente una entrada`).toBe(before + 1);
  if (expected.branchId !== undefined) {
    const row = await pool.query<{ branch_id: string | null }>(
      'SELECT branch_id FROM audit_log WHERE action = $1 AND actor_id = $2 ORDER BY created_at DESC, id DESC LIMIT 1',
      [action, by.id],
    );
    expect(row.rows[0].branch_id, `${action} debe llevar la sucursal`).toBe(expected.branchId);
  }
  exercised.add(action);
}

const futureDate = (days: number): string => {
  const [year, month, day] = todayInElSalvador().split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};
const weekdayOf = (date: string): number => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const daysAgo = (days: number, time: string): string => `${futureDate(-days)} ${time}`;

let branch: TestBranch;
let admin: Actor, reception: Actor, doctor: Actor, otherDoctor: Actor, sales: Actor;
let patient: { id: string };

beforeAll(async () => {
  branch = await createTestBranch();
  admin = await actor('admin');
  reception = await actor('recepcionista', [branch.id]);
  doctor = await actor('doctor', [branch.id]);
  otherDoctor = await actor('doctor', [branch.id]);
  sales = await actor('encargado_venta', [branch.id]);
  patient = await createTestPatient();
});

describe('administración: usuarios y sucursales', () => {
  let newUserId = '';
  let newBranchId = '';

  it('crear un usuario deja user_created', async () => {
    await expectAudited('user_created', admin, async () => {
      const response = await request(app).post('/api/usuarios').set(auth(admin.token)).send({
        full_name: 'Persona Nueva', email: `nuevo-${Date.now()}@prueba.test`, password: 'clave-segura-1',
        role: 'recepcionista', branch_ids: [branch.id],
      });
      newUserId = response.body.data?.id;
      return response;
    }, { status: 201 });
  });

  it('cambiar un usuario deja user_updated', async () => {
    await expectAudited('user_updated', admin, () =>
      request(app).patch(`/api/usuarios/${newUserId}`).set(auth(admin.token)).send({ full_name: 'Persona Renombrada' }), { status: 200 });
  });

  it('cambiar las sucursales de un usuario deja user_branches_updated', async () => {
    await expectAudited('user_branches_updated', admin, () =>
      request(app).put(`/api/usuarios/${newUserId}/sucursales`).set(auth(admin.token)).send({ branch_ids: [branch.id] }), { status: 200 });
  });

  it('desbloquear deja user_unlocked', async () => {
    await expectAudited('user_unlocked', admin, () =>
      request(app).post(`/api/usuarios/${newUserId}/desbloquear`).set(auth(admin.token)), { status: 200 });
  });

  it('restablecer la contraseña deja user_password_reset', async () => {
    await expectAudited('user_password_reset', admin, () =>
      request(app).put(`/api/usuarios/${newUserId}/contrasena`).set(auth(admin.token)).send({ password: 'otra-clave-secreta-9' }), { status: 200 });
  });

  it('crear una sucursal deja branch_created', async () => {
    await expectAudited('branch_created', admin, async () => {
      const response = await request(app).post('/api/sucursales').set(auth(admin.token)).send({
        code: `A${Date.now().toString(36).toUpperCase()}`.slice(0, 20), name: 'Sucursal de Auditoría', address: 'Calle 1',
        phone: '2222-9999', opening_time: '08:00', closing_time: '17:00',
      });
      newBranchId = response.body.data?.id;
      return response;
    }, { status: 201 });
  });

  it('cambiar una sucursal deja branch_updated', async () => {
    await expectAudited('branch_updated', admin, () =>
      request(app).patch(`/api/sucursales/${newBranchId}`).set(auth(admin.token)).send({ name: 'Sucursal Renombrada' }), { status: 200 });
  });
});

describe('inicio de sesión', () => {
  it('un inicio correcto deja login_success y uno fallido login_failed', async () => {
    const user = await createTestUser({ role: 'recepcionista', branchIds: [branch.id] });
    const successBefore = await countOf('login_success', user.id);
    const ok = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
    expect(ok.status).toBe(200);
    expect(await countOf('login_success', user.id)).toBe(successBefore + 1);
    exercised.add('login_success');

    const failedBefore = await countOf('login_failed', null);
    const bad = await request(app).post('/api/auth/login').send({ email: user.email, password: 'incorrecta-123' });
    expect(bad.status).toBe(401);
    expect(await countOf('login_failed', null)).toBe(failedBefore + 1);
    exercised.add('login_failed');
  });

  it('el quinto intento fallido bloquea la cuenta y deja account_locked', async () => {
    const user = await createTestUser({ role: 'recepcionista', branchIds: [branch.id] });
    const before = await countOf('account_locked', null);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post('/api/auth/login').send({ email: user.email, password: 'incorrecta-123' });
    }
    expect(await countOf('account_locked', null)).toBe(before + 1);
    exercised.add('account_locked');
  });
});

describe('pacientes, horarios y citas', () => {
  let patientId = '';
  const date = futureDate(14);
  let scheduleId = '';
  let appointmentId = '';
  let toCancelId = '';

  it('registrar un paciente deja patient_created, con la sucursal', async () => {
    await expectAudited('patient_created', reception, async () => {
      const response = await request(app).post('/api/pacientes').set(auth(reception.token)).send({
        full_name: 'Paciente de Auditoría', birth_date: '1990-05-17', phone: '7000-1111',
      });
      patientId = response.body.data?.id;
      return response;
    }, { status: 201, branchId: branch.id });
  });

  it('modificar un paciente deja patient_updated', async () => {
    await expectAudited('patient_updated', reception, () =>
      request(app).patch(`/api/pacientes/${patientId}`).set(auth(reception.token)).send({ phone: '7000-2222' }), { status: 200 });
  });

  it('crear un bloque de horario deja schedule_created', async () => {
    await expectAudited('schedule_created', admin, async () => {
      const response = await request(app).post('/api/horarios').set(auth(admin.token)).send({
        doctor_id: doctor.id, branch_id: branch.id, weekday: weekdayOf(date), start_time: '08:00', end_time: '12:00',
      });
      scheduleId = response.body.data?.id;
      return response;
    }, { status: 201 });
  });

  it('agendar una cita deja appointment_created, con la sucursal', async () => {
    await expectAudited('appointment_created', reception, async () => {
      const response = await request(app).post('/api/citas').set(auth(reception.token)).send({
        patient_id: patientId, doctor_id: doctor.id, date, time: '09:00',
      });
      appointmentId = response.body.data?.id;
      return response;
    }, { status: 201, branchId: branch.id });
  });

  it('reprogramar una cita deja appointment_rescheduled', async () => {
    await expectAudited('appointment_rescheduled', reception, () =>
      request(app).patch(`/api/citas/${appointmentId}`).set(auth(reception.token)).send({ time: '09:30' }), { status: 200, branchId: branch.id });
  });

  it('cancelar una cita deja appointment_cancelled', async () => {
    const created = await request(app).post('/api/citas').set(auth(reception.token)).send({
      patient_id: patientId, doctor_id: doctor.id, date, time: '10:00',
    });
    toCancelId = created.body.data.id;
    await expectAudited('appointment_cancelled', reception, () =>
      request(app).patch(`/api/citas/${toCancelId}/estado`).set(auth(reception.token)).send({ status: 'cancelled', cancellation_reason: 'El paciente avisó' }), { status: 200 });
  });

  it('marcar una cita como atendida o como ausencia deja su acción', async () => {
    const past = (time: string) => insertAppointment({
      patientId: patient.id, doctorId: doctor.id, branchId: branch.id, createdBy: reception.id, startsAt: daysAgo(3, time),
    }).then((result) => result.rows[0].id);
    const completed = await past('09:00');
    const noShow = await past('10:00');
    await expectAudited('appointment_completed', reception, () =>
      request(app).patch(`/api/citas/${completed}/estado`).set(auth(reception.token)).send({ status: 'completed' }), { status: 200 });
    await expectAudited('appointment_no_show', reception, () =>
      request(app).patch(`/api/citas/${noShow}/estado`).set(auth(reception.token)).send({ status: 'no_show' }), { status: 200 });
  });

  it('cambiar y eliminar un bloque de horario dejan schedule_updated y schedule_deleted', async () => {
    const block = await request(app).post('/api/horarios').set(auth(admin.token)).send({
      doctor_id: otherDoctor.id, branch_id: branch.id, weekday: 3, start_time: '08:00', end_time: '10:00',
    });
    const id = block.body.data.id;
    await expectAudited('schedule_updated', admin, () =>
      request(app).patch(`/api/horarios/${id}`).set(auth(admin.token)).send({ end_time: '11:00' }), { status: 200 });
    await expectAudited('schedule_deleted', admin, () =>
      request(app).delete(`/api/horarios/${id}`).set(auth(admin.token)), { status: 200 });
    expect(scheduleId).not.toBe('');
  });
});

describe('expediente, interconsultas, consentimientos, recetas y órdenes', () => {
  let appointmentId = '';
  let recordId = '';
  let prescriptionId = '';
  let consentId = '';
  let referralId = '';
  let orderId = '';

  beforeAll(async () => {
    appointmentId = (await insertAppointment({
      patientId: patient.id, doctorId: doctor.id, branchId: branch.id, createdBy: reception.id, startsAt: daysAgo(2, '09:00'), status: 'completed',
    })).rows[0].id;
  });

  const base = () => `/api/pacientes/${patient.id}`;

  it('escribir una nota deja record_created', async () => {
    await expectAudited('record_created', doctor, async () => {
      const response = await request(app).post(`${base()}/expediente`).set(auth(doctor.token)).send({ appointment_id: appointmentId, diagnosis: 'Miopía leve' });
      recordId = response.body.data?.id;
      return response;
    }, { status: 201, branchId: branch.id });
  });

  it('leer el expediente deja record_viewed (la lectura queda, no solo la escritura)', async () => {
    await expectAudited('record_viewed', doctor, () => request(app).get(`${base()}/expediente`).set(auth(doctor.token)), { status: 200, branchId: branch.id });
  });

  it('imprimir el expediente deja record_printed', async () => {
    await expectAudited('record_printed', doctor, () => request(app).get(`${base()}/expediente/impresion`).set(auth(doctor.token)), { status: 200, branchId: branch.id });
  });

  it('enmendar una nota deja record_amended', async () => {
    await expectAudited('record_amended', doctor, () =>
      request(app).post(`${base()}/expediente/${recordId}/enmiendas`).set(auth(doctor.token)).send({ diagnosis: 'Miopía leve OD' }), { status: 201, branchId: branch.id });
  });

  it('un médico sin relación con el paciente es negado y queda record_access_denied', async () => {
    await expectAudited('record_access_denied', otherDoctor, () => request(app).get(`${base()}/expediente`).set(auth(otherDoctor.token)), { status: 403, branchId: branch.id });
  });

  it('dar y quitar una interconsulta dejan referral_granted y referral_revoked', async () => {
    await expectAudited('referral_granted', doctor, async () => {
      const response = await request(app).post(`${base()}/interconsultas`).set(auth(doctor.token)).send({ provider_id: otherDoctor.id, reason: 'Segunda opinión', days: 3 });
      referralId = response.body.data?.id;
      return response;
    }, { status: 201, branchId: branch.id });
    await expectAudited('referral_revoked', doctor, () =>
      request(app).post(`${base()}/interconsultas/${referralId}/revocar`).set(auth(doctor.token)), { status: 200, branchId: branch.id });
  });

  it('emitir y reemplazar una receta dejan prescription_issued y prescription_replaced', async () => {
    await expectAudited('prescription_issued', doctor, async () => {
      const response = await request(app).post(`${base()}/recetas`).set(auth(doctor.token)).send({ record_id: recordId, od_sphere: -1.5, oi_sphere: -1.25 });
      prescriptionId = response.body.data?.id;
      return response;
    }, { status: 201, branchId: branch.id });
    await expectAudited('prescription_replaced', doctor, () =>
      request(app).post(`${base()}/recetas/${prescriptionId}/reemplazos`).set(auth(doctor.token)).send({ od_sphere: -1.75, oi_sphere: -1.25 }), { status: 201, branchId: branch.id });
  });

  it('ver las recetas deja prescription_viewed (médico) y, sin consentimiento, la óptica es negada: prescription_access_denied', async () => {
    await expectAudited('prescription_viewed', doctor, () => request(app).get(`${base()}/recetas`).set(auth(doctor.token)), { status: 200, branchId: branch.id });
    await expectAudited('prescription_access_denied', sales, () => request(app).get(`${base()}/recetas`).set(auth(sales.token)), { status: 403, branchId: branch.id });
  });

  it('registrar y revocar un consentimiento dejan consent_granted y consent_revoked', async () => {
    await expectAudited('consent_granted', reception, async () => {
      const response = await request(app).post(`${base()}/consentimientos`).set(auth(reception.token)).send({});
      consentId = response.body.data?.id;
      return response;
    }, { status: 201, branchId: branch.id });

    // Con el consentimiento vigente se crea la orden y la óptica puede ver la receta.
    const current = (await request(app).get(`${base()}/recetas`).set(auth(doctor.token))).body.data[0].id as string;
    await expectAudited('optical_order_created', sales, async () => {
      const response = await request(app).post('/api/ordenes-optica').set(auth(sales.token)).send({
        prescription_id: current, frame_description: 'Armazón negro', lens_description: 'Lentes con filtro', total_amount: 120, deposit_amount: 40,
      });
      orderId = response.body.data?.id;
      return response;
    }, { status: 201, branchId: branch.id });
    await expectAudited('optical_order_status_changed', sales, () =>
      request(app).post(`/api/ordenes-optica/${orderId}/estado`).set(auth(sales.token)).send({ status: 'in_lab' }), { status: 200, branchId: branch.id });

    await expectAudited('consent_revoked', reception, () =>
      request(app).post(`${base()}/consentimientos/${consentId}/revocar`).set(auth(reception.token)), { status: 200, branchId: branch.id });
  });

  it('crear una orden sin consentimiento es negado y deja optical_order_denied', async () => {
    const stranger = await createTestPatient();
    const visit = (await insertAppointment({
      patientId: stranger.id, doctorId: doctor.id, branchId: branch.id, createdBy: reception.id, startsAt: daysAgo(5, '09:00'), status: 'completed',
    })).rows[0].id;
    const record = (await insertMedicalRecord({ patientId: stranger.id, doctorId: doctor.id, branchId: branch.id, appointmentId: visit })).rows[0].id;
    const prescription = (await insertPrescription({ patientId: stranger.id, doctorId: doctor.id, branchId: branch.id, recordId: record })).rows[0].id;
    await expectAudited('optical_order_denied', sales, () =>
      request(app).post('/api/ordenes-optica').set(auth(sales.token)).send({
        prescription_id: prescription, frame_description: 'Armazón', lens_description: 'Lentes', total_amount: 50,
      }), { status: 403, branchId: branch.id });
  });
});

// ---------------------------------------------------------------------------
// Completitud y fugas.
// ---------------------------------------------------------------------------

// Cada ruta que cambia datos (o lee algo sensible) y la acción que debe dejar.
const AUDITED_ROUTES: Record<string, string> = {
  'POST /api/usuarios': 'user_created',
  'PATCH /api/usuarios/:id': 'user_updated',
  'PUT /api/usuarios/:id/sucursales': 'user_branches_updated',
  'POST /api/usuarios/:id/desbloquear': 'user_unlocked',
  'PUT /api/usuarios/:id/contrasena': 'user_password_reset',
  'POST /api/sucursales': 'branch_created',
  'PATCH /api/sucursales/:id': 'branch_updated',
  'POST /api/pacientes': 'patient_created',
  'PATCH /api/pacientes/:id': 'patient_updated',
  'POST /api/horarios': 'schedule_created',
  'PATCH /api/horarios/:id': 'schedule_updated',
  'DELETE /api/horarios/:id': 'schedule_deleted',
  'POST /api/citas': 'appointment_created',
  'PATCH /api/citas/:id': 'appointment_rescheduled',
  'PATCH /api/citas/:id/estado': 'appointment_cancelled',
  'POST /api/pacientes/:patientId/expediente': 'record_created',
  'GET /api/pacientes/:patientId/expediente': 'record_viewed',
  'GET /api/pacientes/:patientId/expediente/impresion': 'record_printed',
  'POST /api/pacientes/:patientId/expediente/:recordId/enmiendas': 'record_amended',
  'POST /api/pacientes/:patientId/interconsultas': 'referral_granted',
  'POST /api/pacientes/:patientId/interconsultas/:referralId/revocar': 'referral_revoked',
  'POST /api/pacientes/:patientId/consentimientos': 'consent_granted',
  'POST /api/pacientes/:patientId/consentimientos/:consentId/revocar': 'consent_revoked',
  'POST /api/pacientes/:patientId/recetas': 'prescription_issued',
  'POST /api/pacientes/:patientId/recetas/:prescriptionId/reemplazos': 'prescription_replaced',
  'GET /api/pacientes/:patientId/recetas': 'prescription_viewed',
  'POST /api/ordenes-optica': 'optical_order_created',
  'POST /api/ordenes-optica/:orderId/estado': 'optical_order_status_changed',
  'POST /api/auth/login': 'login_success',
};

// Rutas que leen datos y a propósito NO dejan entrada (se explica por qué).
const READ_ONLY_NOT_AUDITED = new Set<string>([
  'GET /api/auth/me', 'GET /api/usuarios', 'GET /api/usuarios/:id', 'GET /api/sucursales', 'GET /api/sucursales/:id',
  'GET /api/pacientes', 'GET /api/pacientes/:id', // datos de contacto, no clínicos
  'GET /api/pacientes/:patientId/expediente/pendientes', // solo las citas del propio médico sin nota
  'GET /api/pacientes/:patientId/interconsultas', 'GET /api/pacientes/:patientId/interconsultas/candidatos',
  'GET /api/pacientes/:patientId/consentimientos', 'GET /api/pacientes/:patientId/consentimientos/estado', // solo sí/no
  'GET /api/horarios', 'GET /api/horarios/:id', 'GET /api/disponibilidad', 'GET /api/citas', 'GET /api/citas/:id',
  'GET /api/ordenes-optica', 'GET /api/ordenes-optica/:orderId',
  'GET /api/panel', 'GET /api/recordatorios', 'GET /api/auditoria', 'GET /api/auditoria/filtros',
]);

describe('completitud', () => {
  it('toda ruta de la API está clasificada: con auditoría o de solo lectura declarada (una ruta nueva sin clasificar falla aquí)', () => {
    const unclassified = DISCOVERED.map((route) => route.key).filter((key) => !(key in AUDITED_ROUTES) && !READ_ONLY_NOT_AUDITED.has(key));
    expect(unclassified).toEqual([]);
  });

  it('ninguna ruta que cambia datos (POST, PATCH, PUT, DELETE) figura como "sin auditoría"', () => {
    const writing = [...READ_ONLY_NOT_AUDITED].filter((key) => !key.startsWith('GET '));
    expect(writing).toEqual([]);
  });

  it('las clasificaciones corresponden a rutas que existen', () => {
    const real = new Set(DISCOVERED.map((route) => route.key));
    expect([...Object.keys(AUDITED_ROUTES), ...READ_ONLY_NOT_AUDITED].filter((key) => !real.has(key))).toEqual([]);
  });

  it('toda acción de auditoría que el código escribe fue ejercitada arriba', () => {
    const sources = readdirSync(path.join(__dirname, '../../src'), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.ts'))
      .map((file) => readFileSync(path.join(__dirname, '../../src', file), 'utf8'));
    const written = new Set<string>();
    for (const text of sources) {
      for (const match of text.matchAll(/action: '([a-z_]+)'/g)) written.add(match[1]);
      for (const match of text.matchAll(/: '(appointment_(?:cancelled|completed|no_show))'/g)) written.add(match[1]);
    }
    // login_rate_limited depende de la IP y del limitador: lo prueba auditoriaAutenticacion.prueba.ts.
    written.delete('login_rate_limited');
    expect([...written].filter((action) => !exercised.has(action)).sort()).toEqual([]);
  });

  it('las acciones de AUDITED_ROUTES son todas acciones ejercitadas', () => {
    expect(Object.values(AUDITED_ROUTES).filter((action) => !exercised.has(action))).toEqual([]);
  });
});

describe('la bitácora no guarda secretos', () => {
  it('ninguna entrada contiene contraseñas, hashes ni tokens', async () => {
    const result = await pool.query<{ text: string }>('SELECT (detail::text) AS text FROM audit_log WHERE detail IS NOT NULL');
    const joined = result.rows.map((row) => row.text).join('\n');
    for (const secret of [TEST_PASSWORD, 'clave-segura-1', 'otra-clave-secreta-9', 'incorrecta-123', '$2b$', '$2a$', 'password_hash', 'eyJhbGci']) {
      expect(joined.includes(secret), `la bitácora contiene "${secret}"`).toBe(false);
    }
  });

  it('el correo de un intento fallido que no es un correo no se guarda tal cual (podría ser una contraseña escrita en su lugar)', async () => {
    await request(app).post('/api/auth/login').send({ email: 'esto-podria-ser-una-clave', password: 'x' });
    // El esquema rechaza el formato (400) antes de registrar; si algún día lo registrara, no debe guardarse el texto.
    const result = await pool.query("SELECT 1 FROM audit_log WHERE detail::text ILIKE '%esto-podria-ser-una-clave%'");
    expect(result.rowCount).toBe(0);
  });
});

describe('la bitácora es de solo agregar', () => {
  it('ni siquiera el usuario de la aplicación puede modificar, borrar ni vaciar entradas', async () => {
    await expect(pool.query("UPDATE audit_log SET action = 'x'")).rejects.toThrow();
    await expect(pool.query('DELETE FROM audit_log')).rejects.toThrow();
    await expect(pool.query('TRUNCATE audit_log')).rejects.toThrow();
  });
});
