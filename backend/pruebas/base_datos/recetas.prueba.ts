// =============================================================================
// recetas.prueba.ts
// Qué prueba:   las reglas de la tabla prescriptions (migración 09): rangos y
//               pasos de las medidas, que un ojo con datos tenga esfera, que el
//               eje vaya si y solo si hay cilindro, que se mida al menos un ojo,
//               una receta original por nota, un solo reemplazo por receta, que
//               nada cambie de paciente o de nota, y que no se edite ni se borre.
// Cómo:         inserta con SQL sobre la base de pruebas y comprueba el código
//               de error de PostgreSQL cuando una regla se rompe.
// =============================================================================
import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/configuracion/baseDatos';
import { createTestBranch, createTestUser, type TestBranch, type TestUser } from '../ayudas/datosPrueba';
import {
  createTestPatient,
  insertAppointment,
  insertMedicalRecord,
  insertPrescription,
} from '../ayudas/datosClinicos';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const INSUFFICIENT_PRIVILEGE = '42501';

let branch: TestBranch;
let doctor: TestUser;
let receptionist: TestUser;
let dayCounter = 0;

beforeAll(async () => {
  branch = await createTestBranch();
  doctor = await createTestUser({ role: 'doctor', branchIds: [branch.id] });
  receptionist = await createTestUser({ role: 'recepcionista', branchIds: [branch.id] });
});

// Un paciente con la nota de una consulta del médico.
async function scene() {
  const patient = await createTestPatient();
  dayCounter += 1;
  const day = new Date(Date.UTC(2020, 0, 1 + dayCounter)).toISOString().slice(0, 10);
  const appointmentId = (
    await insertAppointment({
      patientId: patient.id, doctorId: doctor.id, branchId: branch.id, createdBy: receptionist.id, startsAt: `${day} 08:00`,
    })
  ).rows[0].id;
  const recordId = (
    await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: branch.id, appointmentId })
  ).rows[0].id;
  return { patient, recordId };
}

async function issue(columns: Record<string, unknown> = {}, overrides: { supersedesId?: string | null } = {}) {
  const { patient, recordId } = await scene();
  return insertPrescription({
    patientId: patient.id, doctorId: doctor.id, branchId: branch.id, recordId, columns, ...overrides,
  });
}
const stored = async (id: string) => (await pool.query('SELECT * FROM prescriptions WHERE id = $1', [id])).rows[0];

describe('prescriptions — datos', () => {
  it('guarda las medidas de los dos ojos, la distancia pupilar y la nota', async () => {
    const id = (
      await issue({
        od_sphere: -2.25, od_cylinder: -0.75, od_axis: 90, od_addition: 1.5,
        oi_sphere: 0, oi_cylinder: 0, oi_addition: 1.5,
        pupillary_distance: 62.5, lens_notes: 'Antirreflejo',
      })
    ).rows[0].id;
    const row = await stored(id);
    expect(Number(row.od_sphere)).toBe(-2.25);
    expect(Number(row.od_cylinder)).toBe(-0.75);
    expect(row.od_axis).toBe(90);
    expect(Number(row.oi_sphere)).toBe(0);
    expect(Number(row.pupillary_distance)).toBe(62.5);
    expect(row.lens_notes).toBe('Antirreflejo');
    expect(row.supersedes_id).toBeNull();
  });

  it('se puede medir un solo ojo', async () => {
    await expect(issue({ oi_sphere: null })).resolves.toBeDefined();
    await expect(issue({ od_sphere: null })).resolves.toBeDefined();
  });

  it('la nota para el taller no pasa de 500 caracteres', async () => {
    await expect(issue({ lens_notes: 'x'.repeat(501) })).rejects.toMatchObject({ code: '23514' });
    await expect(issue({ lens_notes: 'x'.repeat(500) })).resolves.toBeDefined();
  });
});

describe('prescriptions — rangos y pasos', () => {
  it.each([
    ['esfera OD', { od_sphere: 20.25 }],
    ['esfera OD', { od_sphere: -20.25 }],
    ['esfera OI', { oi_sphere: 21 }],
    ['cilindro OD', { od_cylinder: -8.25, od_axis: 10 }],
    ['cilindro OI', { oi_cylinder: 8.25, oi_axis: 10 }],
    ['eje OD', { od_cylinder: -1, od_axis: 181 }],
    ['eje OD', { od_cylinder: -1, od_axis: 0 }],
    ['eje OI', { oi_cylinder: -1, oi_axis: 181 }],
    ['adición OD', { od_addition: 4.25 }],
    ['adición OD', { od_addition: 0 }],
    ['adición OI', { oi_addition: 0 }],
    ['distancia pupilar', { pupillary_distance: 39.5 }],
    ['distancia pupilar', { pupillary_distance: 80.5 }],
  ])('rechaza %s fuera de rango (%j)', async (_name, columns) => {
    await expect(issue(columns)).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it.each([
    ['esfera', { od_sphere: -1.1 }],
    ['cilindro', { od_cylinder: -0.6, od_axis: 90 }],
    ['adición', { od_addition: 1.1 }],
    ['esfera OI', { oi_sphere: 0.1 }],
    ['distancia pupilar', { pupillary_distance: 62.3 }],
  ])('rechaza una %s que no va en su paso (%j)', async (_name, columns) => {
    await expect(issue(columns)).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('acepta los extremos', async () => {
    await expect(issue({ od_sphere: 20, oi_sphere: -20, od_cylinder: 8, od_axis: 180, oi_cylinder: -8, oi_axis: 1, od_addition: 4, oi_addition: 0.25, pupillary_distance: 40 })).resolves.toBeDefined();
    await expect(issue({ pupillary_distance: 80 })).resolves.toBeDefined();
  });
});

describe('prescriptions — coherencia de cada ojo', () => {
  it('un ojo con cilindro, eje o adición sin esfera se rechaza', async () => {
    await expect(issue({ od_sphere: null, od_addition: 1 })).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(issue({ oi_sphere: null, oi_cylinder: -1, oi_axis: 90 })).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('el eje va si y solo si hay cilindro distinto de cero', async () => {
    await expect(issue({ od_cylinder: -1 })).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(issue({ od_axis: 90 })).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(issue({ oi_cylinder: 0, oi_axis: 90 })).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(issue({ oi_cylinder: -1 })).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(issue({ oi_cylinder: 0 })).resolves.toBeDefined();
    await expect(issue({ oi_cylinder: -1, oi_axis: 90 })).resolves.toBeDefined();
  });

  it('una receta sin ningún ojo medido se rechaza', async () => {
    await expect(issue({ od_sphere: null, oi_sphere: null })).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });
});

describe('prescriptions — una por consulta y un reemplazo por receta', () => {
  it('una nota no puede tener dos recetas originales', async () => {
    const { patient, recordId } = await scene();
    const base = { patientId: patient.id, doctorId: doctor.id, branchId: branch.id, recordId };
    await insertPrescription(base);
    await expect(insertPrescription(base)).rejects.toMatchObject({ code: UNIQUE_VIOLATION, constraint: 'uq_prescriptions_una_por_nota' });
  });

  it('una receta se puede reemplazar, pero una sola vez', async () => {
    const { patient, recordId } = await scene();
    const base = { patientId: patient.id, doctorId: doctor.id, branchId: branch.id, recordId };
    const first = (await insertPrescription(base)).rows[0].id;
    const second = (await insertPrescription({ ...base, supersedesId: first, columns: { od_sphere: -2 } })).rows[0].id;
    await expect(insertPrescription({ ...base, supersedesId: first })).rejects.toMatchObject({
      code: UNIQUE_VIOLATION, constraint: 'uq_prescriptions_un_reemplazo',
    });
    // La cadena sigue: la vigente (la segunda) se puede reemplazar.
    await expect(insertPrescription({ ...base, supersedesId: second })).resolves.toBeDefined();
  });

  it('el reemplazo debe ser de la misma nota', async () => {
    const a = await scene();
    const b = await scene();
    const original = (
      await insertPrescription({ patientId: a.patient.id, doctorId: doctor.id, branchId: branch.id, recordId: a.recordId })
    ).rows[0].id;
    await expect(
      insertPrescription({ patientId: b.patient.id, doctorId: doctor.id, branchId: branch.id, recordId: b.recordId, supersedesId: original }),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it('la receta debe ser del mismo paciente que su nota', async () => {
    const a = await scene();
    const other = await createTestPatient();
    await expect(
      insertPrescription({ patientId: other.id, doctorId: doctor.id, branchId: branch.id, recordId: a.recordId }),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });
});

describe('prescriptions — solo se agrega', () => {
  it('no se puede cambiar ninguna medida ni nada: UPDATE está prohibido', async () => {
    const id = (await issue()).rows[0].id;
    await expect(pool.query(`UPDATE prescriptions SET od_sphere = -3 WHERE id = $1`, [id])).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    await expect(pool.query(`UPDATE prescriptions SET lens_notes = 'x' WHERE id = $1`, [id])).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    expect(Number((await stored(id)).od_sphere)).toBe(-1.5);
  });

  it('no se puede borrar ni vaciar la tabla', async () => {
    const id = (await issue()).rows[0].id;
    await expect(pool.query('DELETE FROM prescriptions WHERE id = $1', [id])).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    await expect(pool.query('TRUNCATE prescriptions')).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    expect(await stored(id)).toBeDefined();
  });

  it('una nota con receta sigue sin poder borrarse ni cambiarse (la protección del expediente no se debilitó)', async () => {
    const { patient, recordId } = await scene();
    await insertPrescription({ patientId: patient.id, doctorId: doctor.id, branchId: branch.id, recordId });
    await expect(pool.query('DELETE FROM medical_records WHERE id = $1', [recordId])).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });
});
