// =============================================================================
// expedientes.prueba.ts
// Qué prueba:   las reglas de la tabla medical_records (migración 06):
//                 - una nota original necesita su cita, y esa cita debe ser del
//                   mismo paciente y del mismo médico;
//                 - una enmienda apunta a una nota del mismo paciente y no
//                   lleva cita;
//                 - una consulta solo se registra una vez;
//                 - RB-03: nada se modifica ni se borra (un UPDATE, un DELETE o
//                   un TRUNCATE directos fallan, aunque se devuelvan permisos).
// Cómo:         inserta con SQL sobre la base de pruebas y comprueba el código
//               de error de PostgreSQL cuando una regla se rompe.
// =============================================================================
import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/configuracion/baseDatos';
import { createTestBranch, createTestUser, type TestBranch, type TestUser } from '../ayudas/datosPrueba';
import { createTestPatient, insertAppointment, insertMedicalRecord } from '../ayudas/datosClinicos';

const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';
const INSUFFICIENT_PRIVILEGE = '42501';

let central: TestBranch;
let escalon: TestBranch;
let receptionist: TestUser;
let day = 0; // cada escena usa un día distinto para que las citas no se crucen

beforeAll(async () => {
  central = await createTestBranch();
  escalon = await createTestBranch();
  receptionist = await createTestUser({ role: 'recepcionista', branchIds: [central.id] });
});

// Un médico, un paciente y una cita atendida entre los dos.
async function scene() {
  day += 1;
  const doctor = await createTestUser({ role: 'doctor', branchIds: [central.id, escalon.id] });
  const patient = await createTestPatient();
  const appointment = (
    await insertAppointment({
      patientId: patient.id, doctorId: doctor.id, branchId: central.id, createdBy: receptionist.id,
      startsAt: `2030-04-${String(day).padStart(2, '0')} 08:00`, status: 'completed',
    })
  ).rows[0].id;
  const write = (overrides: Partial<Parameters<typeof insertMedicalRecord>[0]> = {}) =>
    insertMedicalRecord({
      patientId: patient.id, doctorId: doctor.id, branchId: central.id, appointmentId: appointment, ...overrides,
    });
  return { doctor, patient, appointment, write };
}

describe('medical_records: notas originales', () => {
  it('guarda la nota con su paciente, médico, sucursal y hora local', async () => {
    const { write, patient, doctor } = await scene();
    const id = (await write({ treatment: 'Lentes', notes: 'Control en 6 meses' })).rows[0].id;
    const row = (await pool.query('SELECT * FROM medical_records WHERE id = $1', [id])).rows[0];
    expect(row).toMatchObject({
      patient_id: patient.id, doctor_id: doctor.id, branch_id: central.id,
      diagnosis: 'Miopía leve', treatment: 'Lentes', notes: 'Control en 6 meses', amends_id: null,
    });
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });

  it('el tratamiento y las notas son opcionales', async () => {
    const { write } = await scene();
    await expect(write()).resolves.toBeTruthy();
  });

  it.each(['', '   '])('rechaza un diagnóstico vacío (%j)', async (diagnosis) => {
    const { write } = await scene();
    await expect(write({ diagnosis })).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('rechaza textos más largos que el límite', async () => {
    const { write } = await scene();
    await expect(write({ diagnosis: 'x'.repeat(2001) })).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('una nota original sin cita se rechaza', async () => {
    const { write } = await scene();
    await expect(write({ appointmentId: null })).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('una consulta se registra una sola vez', async () => {
    const { write } = await scene();
    await write();
    await expect(write()).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('la cita debe ser del mismo paciente', async () => {
    const { write } = await scene();
    const other = await createTestPatient();
    await expect(write({ patientId: other.id })).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it('la cita debe ser del mismo médico', async () => {
    const { write } = await scene();
    const otherDoctor = await createTestUser({ role: 'doctor', branchIds: [central.id] });
    await expect(write({ doctorId: otherDoctor.id })).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it('la sucursal puede ser distinta a la de la cita (el médico itinerante)', async () => {
    const { write } = await scene();
    await expect(write({ branchId: escalon.id })).resolves.toBeTruthy();
  });
});

describe('medical_records: enmiendas', () => {
  it('guarda una enmienda de la misma paciente, sin cita', async () => {
    const { write, patient, doctor } = await scene();
    const original = (await write()).rows[0].id;
    const id = (
      await insertMedicalRecord({
        patientId: patient.id, doctorId: doctor.id, branchId: escalon.id, amendsId: original,
        diagnosis: 'Miopía leve, ojo derecho',
      })
    ).rows[0].id;
    const row = (await pool.query('SELECT * FROM medical_records WHERE id = $1', [id])).rows[0];
    expect(row.amends_id).toBe(original);
    expect(row.appointment_id).toBeNull();
  });

  it('otro médico también puede enmendar', async () => {
    const { write, patient } = await scene();
    const original = (await write()).rows[0].id;
    const other = await createTestUser({ role: 'doctor', branchIds: [escalon.id] });
    await expect(
      insertMedicalRecord({ patientId: patient.id, doctorId: other.id, branchId: escalon.id, amendsId: original }),
    ).resolves.toBeTruthy();
  });

  it('se pueden agregar varias enmiendas a la misma nota', async () => {
    const { write, patient, doctor } = await scene();
    const original = (await write()).rows[0].id;
    const amend = () =>
      insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, amendsId: original });
    await amend();
    await expect(amend()).resolves.toBeTruthy();
  });

  it('una enmienda no puede apuntar a una nota de otro paciente', async () => {
    const { write, doctor } = await scene();
    const original = (await write()).rows[0].id;
    const other = await createTestPatient();
    await expect(
      insertMedicalRecord({ patientId: other.id, doctorId: doctor.id, branchId: central.id, amendsId: original }),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it('una enmienda a una nota que no existe se rechaza', async () => {
    const { patient, doctor } = await scene();
    await expect(
      insertMedicalRecord({
        patientId: patient.id, doctorId: doctor.id, branchId: central.id,
        amendsId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it('una fila no puede ser nota original y enmienda a la vez', async () => {
    const { write, patient, doctor, appointment } = await scene();
    const original = (await write()).rows[0].id;
    await expect(
      insertMedicalRecord({
        patientId: patient.id, doctorId: doctor.id, branchId: central.id,
        appointmentId: appointment, amendsId: original,
      }),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });
});

describe('medical_records: solo se agrega (RB-03)', () => {
  it('un UPDATE directo falla y la nota queda igual', async () => {
    const { write } = await scene();
    const id = (await write()).rows[0].id;
    await expect(
      pool.query(`UPDATE medical_records SET diagnosis = 'Otro' WHERE id = $1`, [id]),
    ).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    const row = (await pool.query('SELECT diagnosis FROM medical_records WHERE id = $1', [id])).rows[0];
    expect(row.diagnosis).toBe('Miopía leve');
  });

  it('un DELETE directo falla (sin permiso) y la nota sigue ahí', async () => {
    const { write } = await scene();
    const id = (await write()).rows[0].id;
    await expect(pool.query('DELETE FROM medical_records WHERE id = $1', [id])).rejects.toMatchObject({
      code: INSUFFICIENT_PRIVILEGE,
      message: expect.stringContaining('permission denied'), // la primera capa: sin permiso
    });
    const count = (await pool.query('SELECT count(*)::int AS n FROM medical_records WHERE id = $1', [id])).rows[0].n;
    expect(count).toBe(1);
  });

  it('un TRUNCATE falla (sin permiso)', async () => {
    await expect(pool.query('TRUNCATE medical_records')).rejects.toMatchObject({
      code: INSUFFICIENT_PRIVILEGE,
      message: expect.stringContaining('permission denied'),
    });
  });

  it('aunque se devuelva el permiso de TRUNCATE, se frena', async () => {
    // Lo frena el disparador (mensaje de "enmienda") o, ahora que las recetas
    // apuntan a las notas (migración 09), PostgreSQL mismo, que no deja vaciar una
    // tabla a la que otra apunta con una clave foránea. Las dos protecciones valen.
    await pool.query('GRANT TRUNCATE ON medical_records TO CURRENT_USER');
    try {
      await expect(pool.query('TRUNCATE medical_records')).rejects.toThrow(/enmienda|referenced in a foreign key/);
    } finally {
      await pool.query('REVOKE TRUNCATE ON medical_records FROM CURRENT_USER');
    }
  });

  it('el mensaje del UPDATE explica que se use una enmienda', async () => {
    const { write } = await scene();
    const id = (await write()).rows[0].id;
    await expect(
      pool.query(`UPDATE medical_records SET diagnosis = 'Otro' WHERE id = $1`, [id]),
    ).rejects.toThrow(/enmienda/);
  });

  it('aunque se devuelvan los permisos con GRANT, el disparador sigue protegiendo el DELETE', async () => {
    const { write } = await scene();
    const id = (await write()).rows[0].id;
    await pool.query('GRANT DELETE ON medical_records TO CURRENT_USER');
    try {
      await expect(pool.query('DELETE FROM medical_records WHERE id = $1', [id])).rejects.toThrow(/enmienda/);
    } finally {
      await pool.query('REVOKE DELETE ON medical_records FROM CURRENT_USER');
    }
  });
});
