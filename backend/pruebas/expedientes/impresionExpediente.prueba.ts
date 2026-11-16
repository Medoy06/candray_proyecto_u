// =============================================================================
// impresionExpediente.prueba.ts
// Qué prueba:   GET /api/pacientes/:id/expediente/impresion: el expediente
//               completo para imprimir. Solo lo obtiene el médico que atiende al
//               paciente, queda en la bitácora ANTES de entregar los datos, y un
//               expediente larguísimo se recorta avisándolo.
// Cómo:         llama a la API real (supertest) sobre la base candray_test.
// =============================================================================
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import { RECORD_PRINT_MAX_ENTRIES } from '../../src/configuracion/negocio';
import type { Role } from '../../src/configuracion/roles';
import * as auditModel from '../../src/modelos/auditoria';
import { signToken } from '../../src/utilidades/token';
import { createTestPatient, insertAppointment, insertMedicalRecord, insertReferral } from '../ayudas/datosClinicos';
import { createTestBranch, createTestUser, type TestBranch } from '../ayudas/datosPrueba';

const app = createApp();

async function actor(role: Role, branchIds: string[] = []) {
  const user = await createTestUser({ role, branchIds });
  return { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
}
type Actor = Awaited<ReturnType<typeof actor>>;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const printout = (patientId: string, token: string, headers: Record<string, string> = {}) =>
  request(app).get(`/api/pacientes/${patientId}/expediente/impresion`).set(auth(token)).set(headers);
const auditRows = async (action: string, entityId: string) =>
  (await pool.query('SELECT * FROM audit_log WHERE action = $1 AND entity_id = $2', [action, entityId])).rows;

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
});

async function attend(doctor: Actor, patientId: string): Promise<string> {
  dayCounter += 1;
  const day = new Date(Date.UTC(2020, 0, 1 + dayCounter)).toISOString().slice(0, 10);
  const result = await insertAppointment({
    patientId, doctorId: doctor.id, branchId: central.id, createdBy: receptionist.id, startsAt: `${day} 08:00`,
  });
  return result.rows[0].id;
}

async function scene() {
  const doctor = await actor('doctor', [central.id, escalon.id]);
  const patient = await createTestPatient();
  const appointmentId = await attend(doctor, patient.id);
  return { doctor, patient, appointmentId };
}

describe('quién puede imprimir', () => {
  it('sin token: 401', async () => {
    const { patient } = await scene();
    expect((await request(app).get(`/api/pacientes/${patient.id}/expediente/impresion`)).status).toBe(401);
  });

  it.each(['recepcionista', 'encargado_venta', 'directivo'] as const)(
    '%s no tiene la capacidad: lo frena la ruta (403) y no queda constancia de impresión',
    async (role) => {
      const { patient } = await scene();
      const user = await actor(role, [central.id]);
      const response = await printout(patient.id, user.token);
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('No tiene permisos para realizar esta acción.');
      expect(await auditRows('record_printed', patient.id)).toHaveLength(0);
    },
  );

  it('el administrador de demostración lee pero NO imprime: las notas son del médico (403)', async () => {
    const { patient } = await scene();
    const admin = await actor('admin');
    const response = await printout(patient.id, admin.token);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Solo el médico que atiende al paciente puede imprimir su expediente.');
    expect(await auditRows('record_printed', patient.id)).toHaveLength(0);
  });

  it('quien solo tiene una interconsulta lee, pero no imprime (403)', async () => {
    const { doctor, patient } = await scene();
    const guest = await actor('doctor', [central.id]);
    await insertReferral({ patientId: patient.id, providerId: guest.id, grantedBy: doctor.id });
    const response = await printout(patient.id, guest.token);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Solo el médico que atiende al paciente puede imprimir su expediente.');
    expect(await auditRows('record_printed', patient.id)).toHaveLength(0);
  });

  it('un médico sin relación con el paciente: 403, y queda la negativa (no la impresión)', async () => {
    const { patient } = await scene();
    const stranger = await actor('doctor', [central.id]);
    expect((await printout(patient.id, stranger.token)).status).toBe(403);
    expect(await auditRows('record_access_denied', patient.id)).toHaveLength(1);
    expect(await auditRows('record_printed', patient.id)).toHaveLength(0);
  });

  it('paciente inexistente: 404; identificador mal escrito: 400', async () => {
    const { doctor } = await scene();
    expect((await printout('00000000-0000-0000-0000-000000000000', doctor.token)).status).toBe(404);
    expect((await printout('no-es-un-uuid', doctor.token)).status).toBe(400);
  });
});

describe('lo que entrega', () => {
  it('todas las entradas (notas y enmiendas), la más reciente primero, sin recortar', async () => {
    const { doctor, patient, appointmentId } = await scene();
    const note = (await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, appointmentId, diagnosis: 'Miopía' })).rows[0].id;
    await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: escalon.id, amendsId: note, diagnosis: 'Miopía moderada' });
    const response = await printout(patient.id, doctor.token);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, total: 2, truncated: false });
    expect(response.body.data.map((row: { diagnosis: string }) => row.diagnosis)).toEqual(['Miopía moderada', 'Miopía']);
    expect(response.body.data[0]).toMatchObject({ branch_name: expect.any(String), doctor_name: expect.any(String), amends_id: note });
  });

  it('no mezcla entradas de otros pacientes', async () => {
    const { doctor, patient, appointmentId } = await scene();
    const other = await scene();
    await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, appointmentId });
    await insertMedicalRecord({ patientId: other.patient.id, doctorId: other.doctor.id, branchId: central.id, appointmentId: other.appointmentId });
    expect((await printout(patient.id, doctor.token)).body.total).toBe(1);
  });

  it('un expediente vacío se entrega vacío', async () => {
    const { doctor, patient } = await scene();
    const response = await printout(patient.id, doctor.token);
    expect(response.body).toMatchObject({ data: [], total: 0, truncated: false });
  });

  it(`pasadas las ${RECORD_PRINT_MAX_ENTRIES} entradas se recorta a las más recientes y lo avisa`, async () => {
    const { doctor, patient, appointmentId } = await scene();
    const note = (await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, appointmentId })).rows[0].id;
    await pool.query(
      `INSERT INTO medical_records (patient_id, doctor_id, branch_id, amends_id, diagnosis)
       SELECT $1, $2, $3, $4, 'Enmienda ' || n FROM generate_series(1, $5) AS n`,
      [patient.id, doctor.id, central.id, note, RECORD_PRINT_MAX_ENTRIES],
    );
    const response = await printout(patient.id, doctor.token);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(RECORD_PRINT_MAX_ENTRIES);
    expect(response.body).toMatchObject({ total: RECORD_PRINT_MAX_ENTRIES + 1, truncated: true });
  });
});

describe('constancia en la bitácora', () => {
  it('cada impresión queda registrada con quién, desde qué sucursal y por qué razón', async () => {
    const { doctor, patient } = await scene();
    await printout(patient.id, doctor.token, { 'X-Sucursal-Id': escalon.id });
    const [row] = await auditRows('record_printed', patient.id);
    expect(row).toMatchObject({ entity_type: 'patient', actor_id: doctor.id, branch_id: escalon.id });
    expect(row.detail).toEqual({ access: 'appointment' });
  });

  it('una impresión no cuenta como lectura: cada una deja su propia constancia', async () => {
    const { doctor, patient } = await scene();
    await printout(patient.id, doctor.token);
    expect(await auditRows('record_viewed', patient.id)).toHaveLength(0);
    expect(await auditRows('record_printed', patient.id)).toHaveLength(1);
  });

  it('si no se puede escribir la bitácora, NO se entregan los datos', async () => {
    const { doctor, patient, appointmentId } = await scene();
    await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, appointmentId, diagnosis: 'Secreto' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(auditModel, 'createAuditEntry').mockRejectedValue(new Error('bitácora caída'));
    const response = await printout(patient.id, doctor.token);
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('Secreto');
  });
});
