// =============================================================================
// gestionRecetas.prueba.ts
// Qué prueba:   la API de recetas ópticas por HTTP: quién puede emitir, reemplazar
//               y leer (médicos, administración, y la óptica solo con
//               consentimiento y viendo lo mínimo), las validaciones de las
//               medidas, una receta por consulta, un reemplazo por receta, y la
//               constancia en la bitácora.
// Cómo:         llama a la API real (supertest) sobre la base candray_test.
// Depende de:   app.ts y las ayudas de prueba.
// =============================================================================
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import type { Role } from '../../src/configuracion/roles';
import * as auditModel from '../../src/modelos/auditoria';
import { signToken } from '../../src/utilidades/token';
import {
  createTestPatient, insertAppointment, insertConsent, insertMedicalRecord, insertReferral,
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
const MEASURES = { od_sphere: -1.5, oi_sphere: -1.25 };

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

// Un médico con una consulta (cita + nota) de un paciente nuevo.
async function scene(options: { noteDoctor?: Actor } = {}) {
  const doctor = options.noteDoctor ?? (await actor('doctor', [central.id, escalon.id]));
  const patient = await createTestPatient();
  dayCounter += 1;
  const day = new Date(Date.UTC(2020, 0, 1 + dayCounter)).toISOString().slice(0, 10);
  const appointmentId = (
    await insertAppointment({
      patientId: patient.id, doctorId: doctor.id, branchId: central.id, createdBy: receptionist.id, startsAt: `${day} 08:00`,
    })
  ).rows[0].id;
  const recordId = (
    await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, appointmentId, diagnosis: 'Diagnóstico privado' })
  ).rows[0].id;
  return { doctor, patient, recordId };
}

const list = (patientId: string, token: string, headers: Record<string, string> = {}) =>
  request(app).get(`/api/pacientes/${patientId}/recetas`).set(auth(token)).set(headers);
const issue = (patientId: string, token: string, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  request(app).post(`/api/pacientes/${patientId}/recetas`).set(auth(token)).set(headers).send(body);
const replace = (patientId: string, prescriptionId: string, token: string, body: Record<string, unknown>) =>
  request(app).post(`/api/pacientes/${patientId}/recetas/${prescriptionId}/reemplazos`).set(auth(token)).send(body);

const auditRows = async (action: string, entityId: string) =>
  (await pool.query('SELECT * FROM audit_log WHERE action = $1 AND entity_id = $2', [action, entityId])).rows;

// Emite una receta por la API y devuelve su id.
async function issued(patientId: string, recordId: string, token: string, extra: Record<string, unknown> = {}) {
  const response = await issue(patientId, token, { record_id: recordId, ...MEASURES, ...extra });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

// -----------------------------------------------------------------------------
describe('permisos por rol', () => {
  it('sin token: 401 en las tres rutas', async () => {
    const { patient } = await scene();
    const base = `/api/pacientes/${patient.id}/recetas`;
    expect((await request(app).get(base)).status).toBe(401);
    expect((await request(app).post(base).send({})).status).toBe(401);
    expect((await request(app).post(`${base}/${UUID_THAT_DOES_NOT_EXIST}/reemplazos`).send({})).status).toBe(401);
  });

  it.each(['recepcionista', 'encargado_venta', 'directivo'] as const)('%s no puede emitir ni reemplazar (403)', async (role) => {
    const { patient, recordId } = await scene();
    const user = await actor(role, [central.id]);
    for (const response of [
      await issue(patient.id, user.token, { record_id: recordId, ...MEASURES }),
      await replace(patient.id, UUID_THAT_DOES_NOT_EXIST, user.token, MEASURES),
    ]) {
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('No tiene permisos para realizar esta acción.');
    }
  });

  it.each(['recepcionista', 'directivo'] as const)('%s no puede leer las recetas (403)', async (role) => {
    const { patient } = await scene();
    const user = await actor(role, [central.id]);
    const response = await list(patient.id, user.token);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('No tiene permisos para realizar esta acción.');
  });

  it('el administrador de demostración lee las recetas pero no emite ni reemplaza (403)', async () => {
    const { doctor, patient, recordId } = await scene();
    const id = await issued(patient.id, recordId, doctor.token);
    const admin = await actor('admin');
    expect((await list(patient.id, admin.token)).status).toBe(200);
    const issuing = await issue(patient.id, admin.token, { record_id: recordId, ...MEASURES });
    expect(issuing.status).toBe(403);
    expect(issuing.body.message).toBe('Solo el médico que atendió la consulta puede emitir recetas.');
    const replacing = await replace(patient.id, id, admin.token, MEASURES);
    expect(replacing.status).toBe(403);
    expect(replacing.body.message).toBe('Solo un médico que haya atendido al paciente puede reemplazar una receta.');
  });
});

// -----------------------------------------------------------------------------
describe('emitir', () => {
  it('guarda las medidas, quién la emitió (del token) y la sucursal, y responde 201', async () => {
    const { doctor, patient, recordId } = await scene();
    const response = await issue(
      patient.id, doctor.token,
      { record_id: recordId, od_sphere: -2.25, od_cylinder: -0.75, od_axis: 90, od_addition: 1.5, oi_sphere: -2, pupillary_distance: 62.5, lens_notes: '  Antirreflejo  ' },
      { 'X-Sucursal-Id': escalon.id },
    );
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      patient_id: patient.id, doctor_id: doctor.id, branch_id: escalon.id, record_id: recordId, supersedes_id: null,
      od_sphere: -2.25, od_cylinder: -0.75, od_axis: 90, od_addition: 1.5,
      oi_sphere: -2, oi_cylinder: null, oi_axis: null, oi_addition: null,
      pupillary_distance: 62.5, lens_notes: 'Antirreflejo', is_current: true,
    });
    expect(typeof response.body.data.od_sphere).toBe('number');
  });

  it('un cuerpo con doctor_id o branch_id falsos los ignora', async () => {
    const { doctor, patient, recordId } = await scene();
    const other = await actor('doctor', [central.id]);
    const response = await issue(patient.id, doctor.token, {
      record_id: recordId, ...MEASURES, doctor_id: other.id, branch_id: escalon.id, is_current: false,
    });
    expect(response.body.data.doctor_id).toBe(doctor.id);
    expect(response.body.data.branch_id).toBe(central.id);
  });

  it('la nota para el taller vacía se guarda como null', async () => {
    const { doctor, patient, recordId } = await scene();
    const response = await issue(patient.id, doctor.token, { record_id: recordId, ...MEASURES, lens_notes: '   ' });
    expect(response.body.data.lens_notes).toBeNull();
  });

  it('un médico no emite desde la nota de otro médico (403)', async () => {
    const { patient, recordId } = await scene();
    const other = await actor('doctor', [central.id]);
    const response = await issue(patient.id, other.token, { record_id: recordId, ...MEASURES });
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Solo el médico que escribió la nota puede emitir su receta.');
  });

  it('una nota de otro paciente o inexistente: 404', async () => {
    const mine = await scene();
    const other = await scene({ noteDoctor: mine.doctor });
    expect((await issue(mine.patient.id, mine.doctor.token, { record_id: other.recordId, ...MEASURES })).status).toBe(404);
    expect((await issue(mine.patient.id, mine.doctor.token, { record_id: UUID_THAT_DOES_NOT_EXIST, ...MEASURES })).status).toBe(404);
  });

  it('desde una enmienda no se emite (409): la receta es de la nota original', async () => {
    const { doctor, patient, recordId } = await scene();
    const amendment = (
      await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, amendsId: recordId })
    ).rows[0].id;
    const response = await issue(patient.id, doctor.token, { record_id: amendment, ...MEASURES });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('La receta se emite desde la nota original de la consulta, no desde una enmienda.');
  });

  it('una consulta tiene una sola receta: la segunda es 409', async () => {
    const { doctor, patient, recordId } = await scene();
    await issued(patient.id, recordId, doctor.token);
    const second = await issue(patient.id, doctor.token, { record_id: recordId, ...MEASURES });
    expect(second.status).toBe(409);
    expect(second.body.message).toBe('Esa consulta ya tiene su receta. Para corregirla, emita una que la reemplace.');
  });

  it('dos emisiones simultáneas de la misma consulta: solo una entra', async () => {
    const { doctor, patient, recordId } = await scene();
    const results = await Promise.all([
      issue(patient.id, doctor.token, { record_id: recordId, ...MEASURES }),
      issue(patient.id, doctor.token, { record_id: recordId, ...MEASURES }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('paciente inexistente: 404; identificador mal escrito: 400', async () => {
    const doctor = await actor('doctor', [central.id]);
    expect((await issue(UUID_THAT_DOES_NOT_EXIST, doctor.token, { record_id: UUID_THAT_DOES_NOT_EXIST, ...MEASURES })).status).toBe(404);
    expect((await issue('no-es-un-uuid', doctor.token, { record_id: UUID_THAT_DOES_NOT_EXIST, ...MEASURES })).status).toBe(400);
  });
});

// -----------------------------------------------------------------------------
describe('validación de las medidas', () => {
  const rejects = async (body: Record<string, unknown>, field: string, message?: string) => {
    const { doctor, patient, recordId } = await scene();
    const response = await issue(patient.id, doctor.token, { record_id: recordId, ...body });
    expect(response.status).toBe(400);
    expect(response.body.errors.map((e: { field: string }) => e.field)).toContain(field);
    if (message) expect(response.body.errors.map((e: { message: string }) => e.message)).toContain(message);
  };

  it('sin la nota: 400', async () => {
    const { doctor, patient } = await scene();
    const response = await issue(patient.id, doctor.token, MEASURES);
    expect(response.status).toBe(400);
    expect(response.body.errors.map((e: { field: string }) => e.field)).toContain('record_id');
  });

  it('sin ningún ojo: 400', async () => {
    await rejects({}, 'od_sphere', 'Indique las medidas de al menos un ojo');
    await rejects({ od_sphere: null, oi_sphere: null }, 'od_sphere');
  });

  it('un ojo con datos pero sin esfera: 400', async () => {
    await rejects({ oi_sphere: -1, od_addition: 1 }, 'od_sphere', 'Indique la esfera del ojo derecho (puede ser 0)');
    await rejects({ od_sphere: -1, oi_cylinder: -1, oi_axis: 10 }, 'oi_sphere', 'Indique la esfera del ojo izquierdo (puede ser 0)');
  });

  it('esfera 0 ("plano") es válida', async () => {
    const { doctor, patient, recordId } = await scene();
    expect((await issue(patient.id, doctor.token, { record_id: recordId, od_sphere: 0 })).status).toBe(201);
  });

  it('el cilindro pide eje, y el eje pide cilindro', async () => {
    await rejects({ ...MEASURES, od_cylinder: -1 }, 'od_axis', 'Indique el eje del ojo derecho: tiene cilindro');
    await rejects({ ...MEASURES, oi_cylinder: -1 }, 'oi_axis', 'Indique el eje del ojo izquierdo: tiene cilindro');
    await rejects({ ...MEASURES, od_axis: 90 }, 'od_axis', 'El ojo derecho no lleva eje sin cilindro');
    await rejects({ ...MEASURES, oi_cylinder: 0, oi_axis: 90 }, 'oi_axis', 'El ojo izquierdo no lleva eje sin cilindro');
  });

  it.each([
    ['od_sphere', 20.25], ['od_sphere', -20.25], ['oi_sphere', 21],
    ['od_cylinder', 8.25], ['oi_cylinder', -8.25],
    ['od_addition', 4.25], ['oi_addition', 0], ['od_addition', -1],
    ['pupillary_distance', 39.5], ['pupillary_distance', 80.5],
  ])('%s = %s fuera de rango: 400', async (field, value) => {
    const extra: Record<string, unknown> = { ...MEASURES, [field]: value };
    if (field.endsWith('cylinder')) extra[field.replace('cylinder', 'axis')] = 90;
    await rejects(extra, field);
  });

  it.each([['od_axis', 0], ['od_axis', 181], ['oi_axis', 90.5]])('%s = %s: 400', async (field, value) => {
    const eye = field.slice(0, 2);
    await rejects({ ...MEASURES, [`${eye}_cylinder`]: -1, [field]: value }, field);
  });

  it.each([
    ['od_sphere', -1.1], ['oi_sphere', 0.3], ['od_cylinder', -0.6], ['oi_addition', 1.1], ['pupillary_distance', 62.3],
  ])('%s = %s no va en su paso: 400', async (field, value) => {
    const extra: Record<string, unknown> = { ...MEASURES, [field]: value };
    if (field.endsWith('cylinder')) extra[field.replace('cylinder', 'axis')] = 90;
    await rejects(extra, field);
  });

  it('un texto en lugar de un número: 400', async () => {
    await rejects({ od_sphere: '-1.5' }, 'od_sphere');
    await rejects({ ...MEASURES, pupillary_distance: 'ancho' }, 'pupillary_distance');
  });

  it('una nota para el taller de más de 500 caracteres: 400', async () => {
    await rejects({ ...MEASURES, lens_notes: 'x'.repeat(501) }, 'lens_notes');
  });

  it('los extremos se aceptan', async () => {
    const { doctor, patient, recordId } = await scene();
    const response = await issue(patient.id, doctor.token, {
      record_id: recordId, od_sphere: 20, od_cylinder: 8, od_axis: 180, od_addition: 4,
      oi_sphere: -20, oi_cylinder: -8, oi_axis: 1, oi_addition: 0.25, pupillary_distance: 80, lens_notes: 'x'.repeat(500),
    });
    expect(response.status).toBe(201);
  });
});

// -----------------------------------------------------------------------------
describe('reemplazar', () => {
  it('crea una receta nueva de la misma nota; la anterior deja de ser vigente y queda en el historial', async () => {
    const { doctor, patient, recordId } = await scene();
    const first = await issued(patient.id, recordId, doctor.token);
    const response = await replace(patient.id, first, doctor.token, { od_sphere: -2, oi_sphere: -1.75 });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      supersedes_id: first, record_id: recordId, patient_id: patient.id, doctor_id: doctor.id, od_sphere: -2, is_current: true,
    });
    const all = (await list(patient.id, doctor.token)).body.data as { id: string; is_current: boolean }[];
    expect(all.map((p) => [p.id, p.is_current])).toEqual([[response.body.data.id, true], [first, false]]);
  });

  it('el reemplazo trae las medidas completas: lo que no se repite queda en blanco', async () => {
    const { doctor, patient, recordId } = await scene();
    const first = await issued(patient.id, recordId, doctor.token, { od_cylinder: -1, od_axis: 45, pupillary_distance: 60 });
    const response = await replace(patient.id, first, doctor.token, { od_sphere: -2 });
    expect(response.body.data).toMatchObject({ od_cylinder: null, od_axis: null, oi_sphere: null, pupillary_distance: null });
  });

  it('otro médico que también atendió al paciente puede corregirla', async () => {
    const { doctor, patient, recordId } = await scene();
    const first = await issued(patient.id, recordId, doctor.token);
    const colleague = await actor('doctor', [central.id]);
    dayCounter += 1;
    const day = new Date(Date.UTC(2020, 0, 1 + dayCounter)).toISOString().slice(0, 10);
    await insertAppointment({ patientId: patient.id, doctorId: colleague.id, branchId: central.id, createdBy: receptionist.id, startsAt: `${day} 09:00` });
    const response = await replace(patient.id, first, colleague.token, MEASURES);
    expect(response.status).toBe(201);
    expect(response.body.data.doctor_id).toBe(colleague.id);
  });

  it('quien solo tiene una interconsulta no puede reemplazar (403)', async () => {
    const { doctor, patient, recordId } = await scene();
    const first = await issued(patient.id, recordId, doctor.token);
    const guest = await actor('doctor', [central.id]);
    await insertReferral({ patientId: patient.id, providerId: guest.id, grantedBy: doctor.id });
    const response = await replace(patient.id, first, guest.token, MEASURES);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Solo un médico que haya atendido al paciente puede reemplazar una receta.');
  });

  it('un médico sin relación con el paciente: 403', async () => {
    const { doctor, patient, recordId } = await scene();
    const first = await issued(patient.id, recordId, doctor.token);
    const stranger = await actor('doctor', [central.id]);
    expect((await replace(patient.id, first, stranger.token, MEASURES)).status).toBe(403);
  });

  it('una receta ya reemplazada no se reemplaza otra vez (409); se reemplaza la vigente', async () => {
    const { doctor, patient, recordId } = await scene();
    const first = await issued(patient.id, recordId, doctor.token);
    const second = (await replace(patient.id, first, doctor.token, MEASURES)).body.data.id;
    const again = await replace(patient.id, first, doctor.token, MEASURES);
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('Esa receta ya fue reemplazada.');
    expect((await replace(patient.id, second, doctor.token, MEASURES)).status).toBe(201);
  });

  it('dos reemplazos simultáneos de la misma receta: solo uno entra', async () => {
    const { doctor, patient, recordId } = await scene();
    const first = await issued(patient.id, recordId, doctor.token);
    const results = await Promise.all([
      replace(patient.id, first, doctor.token, MEASURES),
      replace(patient.id, first, doctor.token, MEASURES),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('una receta de otro paciente o inexistente: 404', async () => {
    const mine = await scene();
    const other = await scene();
    const otherPrescription = await issued(other.patient.id, other.recordId, other.doctor.token);
    // El médico atiende a los dos pacientes para que el 404 sea por la receta y no por el acceso.
    dayCounter += 1;
    const day = new Date(Date.UTC(2020, 0, 1 + dayCounter)).toISOString().slice(0, 10);
    await insertAppointment({ patientId: mine.patient.id, doctorId: other.doctor.id, branchId: central.id, createdBy: receptionist.id, startsAt: `${day} 10:00` });
    expect((await replace(mine.patient.id, otherPrescription, other.doctor.token, MEASURES)).status).toBe(404);
    expect((await replace(mine.patient.id, UUID_THAT_DOES_NOT_EXIST, other.doctor.token, MEASURES)).status).toBe(404);
  });

  it('las mismas validaciones de medidas: sin ojos, 400', async () => {
    const { doctor, patient, recordId } = await scene();
    const first = await issued(patient.id, recordId, doctor.token);
    const response = await replace(patient.id, first, doctor.token, {});
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Datos inválidos.');
    expect(response.body.errors.map((e: { message: string }) => e.message)).toContain('Indique las medidas de al menos un ojo');
  });

  it('no hay forma de editar ni borrar: PUT, PATCH y DELETE no existen', async () => {
    const { doctor, patient, recordId } = await scene();
    const id = await issued(patient.id, recordId, doctor.token);
    for (const method of ['put', 'patch', 'delete'] as const) {
      const response = await request(app)[method](`/api/pacientes/${patient.id}/recetas/${id}`).set(auth(doctor.token));
      expect(response.status).toBe(404);
    }
  });
});

// -----------------------------------------------------------------------------
describe('leer — médicos y administración', () => {
  it('el médico que atiende ve todas las recetas, con nombres, y por qué tiene acceso', async () => {
    const { doctor, patient, recordId } = await scene();
    const first = await issued(patient.id, recordId, doctor.token, { lens_notes: 'Nota' });
    const second = (await replace(patient.id, first, doctor.token, MEASURES)).body.data.id;
    const response = await list(patient.id, doctor.token);
    expect(response.status).toBe(200);
    expect(response.body.access).toBe('appointment');
    expect(response.body.data.map((p: { id: string }) => p.id)).toEqual([second, first]);
    expect(response.body.data[0]).toMatchObject({ doctor_name: expect.any(String), branch_name: expect.any(String), record_id: recordId });
  });

  it('quien recibió una interconsulta puede leer (acceso "referral")', async () => {
    const { doctor, patient, recordId } = await scene();
    await issued(patient.id, recordId, doctor.token);
    const guest = await actor('doctor', [central.id]);
    await insertReferral({ patientId: patient.id, providerId: guest.id, grantedBy: doctor.id });
    const response = await list(patient.id, guest.token);
    expect(response.status).toBe(200);
    expect(response.body.access).toBe('referral');
    expect(response.body.data).toHaveLength(1);
  });

  it('un médico sin relación con el paciente: 403 y queda la negativa', async () => {
    const { patient } = await scene();
    const stranger = await actor('doctor', [central.id]);
    expect((await list(patient.id, stranger.token)).status).toBe(403);
    expect(await auditRows('record_access_denied', patient.id)).toHaveLength(1);
  });

  it('no mezcla recetas de otros pacientes', async () => {
    const a = await scene();
    const b = await scene();
    await issued(a.patient.id, a.recordId, a.doctor.token);
    await issued(b.patient.id, b.recordId, b.doctor.token);
    expect((await list(a.patient.id, a.doctor.token)).body.data).toHaveLength(1);
  });

  it('el administrador de demostración ve las recetas (acceso "role")', async () => {
    const { doctor, patient, recordId } = await scene();
    await issued(patient.id, recordId, doctor.token);
    const admin = await actor('admin');
    const response = await list(patient.id, admin.token);
    expect(response.body.access).toBe('role');
    expect(response.body.data).toHaveLength(1);
  });

  it('paciente inexistente: 404', async () => {
    const doctor = await actor('doctor', [central.id]);
    expect((await list(UUID_THAT_DOES_NOT_EXIST, doctor.token)).status).toBe(404);
  });
});

// -----------------------------------------------------------------------------
describe('leer — la óptica', () => {
  async function opticalScene() {
    const base = await scene();
    const prescriptionId = await issued(base.patient.id, base.recordId, base.doctor.token, { lens_notes: 'Para el taller' });
    const optical = await actor('encargado_venta', [central.id]);
    return { ...base, prescriptionId, optical };
  }

  it('sin consentimiento: 403, no entrega nada y queda la negativa', async () => {
    const { patient, optical } = await opticalScene();
    const response = await list(patient.id, optical.token);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('El paciente no ha autorizado que la óptica vea su receta.');
    expect(JSON.stringify(response.body)).not.toContain('Para el taller');
    const [row] = await auditRows('prescription_access_denied', patient.id);
    expect(row).toMatchObject({ entity_type: 'patient', actor_id: optical.id, branch_id: central.id });
    expect(row.detail).toEqual({ reason: 'no_consent' });
    expect(await auditRows('prescription_viewed', patient.id)).toHaveLength(0);
  });

  it('con consentimiento vigente: ve solo las recetas vigentes y solo lo mínimo', async () => {
    const { doctor, patient, recordId, prescriptionId, optical } = await opticalScene();
    await insertConsent({ patientId: patient.id, grantedBy: doctor.id });
    const replacement = (await replace(patient.id, prescriptionId, doctor.token, { od_sphere: -3, oi_sphere: -2.5 })).body.data.id;
    const response = await list(patient.id, optical.token);
    expect(response.status).toBe(200);
    expect(response.body.access).toBe('consent');
    expect(response.body.data.map((p: { id: string }) => p.id)).toEqual([replacement]);
    expect(Object.keys(response.body.data[0]).sort()).toEqual([
      'created_at', 'doctor_name', 'id', 'is_current', 'lens_notes', 'oi_addition', 'oi_axis', 'oi_cylinder', 'oi_sphere',
      'od_addition', 'od_axis', 'od_cylinder', 'od_sphere', 'pupillary_distance',
    ].sort());
    expect(JSON.stringify(response.body)).not.toContain('Diagnóstico privado');
    expect(JSON.stringify(response.body)).not.toContain(recordId);
  });

  it('con consentimiento y sin recetas: lista vacía', async () => {
    const patient = await createTestPatient();
    const staff = await actor('recepcionista', [central.id]);
    await insertConsent({ patientId: patient.id, grantedBy: staff.id });
    const optical = await actor('encargado_venta', [central.id]);
    const response = await list(patient.id, optical.token);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it('el consentimiento es por paciente: el de otro no sirve', async () => {
    const { optical } = await opticalScene();
    const other = await scene();
    await issued(other.patient.id, other.recordId, other.doctor.token);
    const staff = await actor('recepcionista', [central.id]);
    const granted = await createTestPatient();
    await insertConsent({ patientId: granted.id, grantedBy: staff.id });
    expect((await list(other.patient.id, optical.token)).status).toBe(403);
  });

  it('un consentimiento revocado vuelve a cerrar el acceso', async () => {
    const { doctor, patient, optical } = await opticalScene();
    await insertConsent({ patientId: patient.id, grantedBy: doctor.id, revokedBy: doctor.id });
    expect((await list(patient.id, optical.token)).status).toBe(403);
  });

  it('la lectura con consentimiento queda en la bitácora', async () => {
    const { doctor, patient, optical } = await opticalScene();
    await insertConsent({ patientId: patient.id, grantedBy: doctor.id });
    await list(patient.id, optical.token, { 'X-Sucursal-Id': central.id });
    const [row] = await auditRows('prescription_viewed', patient.id);
    expect(row).toMatchObject({ entity_type: 'patient', actor_id: optical.id, branch_id: central.id });
    expect(row.detail).toEqual({ access: 'consent' });
  });

  it('paciente inexistente: 404 (antes de hablar del consentimiento)', async () => {
    const optical = await actor('encargado_venta', [central.id]);
    expect((await list(UUID_THAT_DOES_NOT_EXIST, optical.token)).status).toBe(404);
  });
});

// -----------------------------------------------------------------------------
describe('bitácora', () => {
  it('cada lectura de un médico queda registrada con la razón del acceso', async () => {
    const { doctor, patient } = await scene();
    await list(patient.id, doctor.token, { 'X-Sucursal-Id': escalon.id });
    const [row] = await auditRows('prescription_viewed', patient.id);
    expect(row).toMatchObject({ entity_type: 'patient', actor_id: doctor.id, branch_id: escalon.id });
    expect(row.detail).toEqual({ access: 'appointment' });
  });

  it('si no se puede escribir la bitácora, NO se entregan las recetas', async () => {
    const { doctor, patient, recordId } = await scene();
    await issued(patient.id, recordId, doctor.token, { lens_notes: 'Secreto del taller' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(auditModel, 'createAuditEntry').mockRejectedValue(new Error('bitácora caída'));
    const response = await list(patient.id, doctor.token);
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('Secreto del taller');
  });

  it('si no se puede escribir la bitácora, tampoco se entrega a la óptica', async () => {
    const { doctor, patient, recordId } = await scene();
    await issued(patient.id, recordId, doctor.token, { lens_notes: 'Secreto del taller' });
    await insertConsent({ patientId: patient.id, grantedBy: doctor.id });
    const optical = await actor('encargado_venta', [central.id]);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(auditModel, 'createAuditEntry').mockRejectedValue(new Error('bitácora caída'));
    const response = await list(patient.id, optical.token);
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('Secreto del taller');
  });

  it('emitir queda anotado, y una emisión rechazada no deja anotación', async () => {
    const { doctor, patient, recordId } = await scene();
    const id = await issued(patient.id, recordId, doctor.token);
    await issue(patient.id, doctor.token, { record_id: recordId, ...MEASURES });
    const rows = await auditRows('prescription_issued', id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity_type: 'prescription', actor_id: doctor.id, branch_id: central.id });
    expect(rows[0].detail).toEqual({ patient_id: patient.id, record_id: recordId });
  });

  it('reemplazar queda anotado con la receta que reemplaza', async () => {
    const { doctor, patient, recordId } = await scene();
    const first = await issued(patient.id, recordId, doctor.token);
    const second = (await replace(patient.id, first, doctor.token, MEASURES)).body.data.id;
    await replace(patient.id, first, doctor.token, MEASURES); // rechazada
    const rows = await auditRows('prescription_replaced', second);
    expect(rows).toHaveLength(1);
    expect(rows[0].detail).toEqual({ patient_id: patient.id, supersedes_id: first });
    expect((await pool.query(`SELECT 1 FROM audit_log WHERE action = 'prescription_replaced'  AND detail->>'supersedes_id' = $1`, [first])).rowCount).toBe(1);
  });
});
