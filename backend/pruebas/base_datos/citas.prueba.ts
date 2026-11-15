// =============================================================================
// citas.prueba.ts
// Qué prueba:   las reglas de la tabla appointments (migración 05): duración de
//               30 minutos, horas enteras o medias, motivo de cancelación, y
//               sobre todo la regla RB-02: un médico (y un paciente) no puede
//               tener dos citas al mismo tiempo, aunque sean en sucursales
//               distintas, y una cita cancelada libera el horario.
// Cómo:         inserta con SQL sobre la base de pruebas y comprueba el código
//               de error de PostgreSQL cuando una regla se rompe. Incluye una
//               prueba con dos agendados simultáneos.
// =============================================================================
import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/configuracion/baseDatos';
import { createTestBranch, createTestUser, type TestBranch, type TestUser } from '../ayudas/datosPrueba';
import { createTestPatient, insertAppointment, type AppointmentInput } from '../ayudas/datosClinicos';

const CHECK_VIOLATION = '23514';
const EXCLUSION_VIOLATION = '23P01';
const INVALID_ENUM = '22P02';

const DAY = '2030-03-04'; // una fecha futura fija, para que las pruebas sean repetibles

let central: TestBranch;
let escalon: TestBranch;
let receptionist: TestUser;

beforeAll(async () => {
  central = await createTestBranch();
  escalon = await createTestBranch();
  receptionist = await createTestUser({ role: 'recepcionista', branchIds: [central.id] });
});

// Cada prueba usa su propio médico y su propio paciente.
async function scene() {
  const doctor = await createTestUser({ role: 'doctor', branchIds: [central.id, escalon.id] });
  const patient = await createTestPatient();
  const book = (overrides: Partial<AppointmentInput> = {}) =>
    insertAppointment({
      patientId: patient.id, doctorId: doctor.id, branchId: central.id,
      createdBy: receptionist.id, startsAt: `${DAY} 08:00`, ...overrides,
    });
  return { doctor, patient, book };
}

describe('appointments: datos válidos', () => {
  it('guarda la cita como agendada y de 30 minutos', async () => {
    const { book } = await scene();
    const id = (await book()).rows[0].id;
    const row = (await pool.query('SELECT * FROM appointments WHERE id = $1', [id])).rows[0];
    expect(row.status).toBe('scheduled');
    expect(row.starts_at).toBe(`${DAY} 08:00:00`);
    expect(row.ends_at).toBe(`${DAY} 08:30:00`);
  });

  it('acepta citas que empiezan a la hora en punto y a y media', async () => {
    const { book } = await scene();
    await expect(book({ startsAt: `${DAY} 09:00` })).resolves.toBeTruthy();
    await expect(book({ startsAt: `${DAY} 14:30` })).resolves.toBeTruthy();
  });

  it('cambiar la cita actualiza updated_at', async () => {
    const { book } = await scene();
    const id = (await book()).rows[0].id;
    const before = (await pool.query('SELECT updated_at FROM appointments WHERE id = $1', [id])).rows[0];
    await pool.query('SELECT pg_sleep(0.05)');
    await pool.query(`UPDATE appointments SET status = 'completed' WHERE id = $1`, [id]);
    const after = (await pool.query('SELECT updated_at FROM appointments WHERE id = $1', [id])).rows[0];
    expect(after.updated_at > before.updated_at).toBe(true);
  });

  it('rechaza un estado que no existe', async () => {
    const { book } = await scene();
    await expect(book({ status: 'inventado' as never })).rejects.toMatchObject({ code: INVALID_ENUM });
  });
});

describe('appointments: duración y horas', () => {
  it.each(['08:15', '08:45', '08:10'])('rechaza una cita que empieza a las %s', async (hora) => {
    const { book } = await scene();
    await expect(book({ startsAt: `${DAY} ${hora}` })).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('rechaza una cita que empieza con segundos', async () => {
    const { book } = await scene();
    await expect(
      book({ startsAt: `${DAY} 08:00:30`, endsAt: `${DAY} 08:30:30` }),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it.each(['08:15', '08:45', '09:00', '08:00'])('rechaza una cita que termina a las %s (debe durar 30 minutos)', async (fin) => {
    const { book } = await scene();
    await expect(book({ endsAt: `${DAY} ${fin}` })).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });
});

describe('appointments: cancelación', () => {
  it('el motivo de cancelación solo se acepta en una cita cancelada', async () => {
    const { book } = await scene();
    await expect(book({ status: 'scheduled', cancellationReason: 'x' })).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(book({ status: 'completed', cancellationReason: 'x' })).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(book({ status: 'cancelled', cancellationReason: 'Paciente avisó' })).resolves.toBeTruthy();
  });

  it('el motivo de cancelación es opcional', async () => {
    const { book } = await scene();
    await expect(book({ status: 'cancelled' })).resolves.toBeTruthy();
  });
});

describe('appointments: RB-02, un médico no está en dos citas a la vez', () => {
  it('rechaza una segunda cita del mismo médico a la misma hora', async () => {
    const { doctor, book } = await scene();
    await book();
    const otherPatient = await createTestPatient();
    await expect(
      insertAppointment({
        patientId: otherPatient.id, doctorId: doctor.id, branchId: central.id,
        createdBy: receptionist.id, startsAt: `${DAY} 08:00`,
      }),
    ).rejects.toMatchObject({ code: EXCLUSION_VIOLATION });
  });

  it('la regla vale entre sucursales: el médico itinerante no puede estar en Central y en Escalón a la vez', async () => {
    const { doctor, book } = await scene();
    await book({ branchId: central.id });
    const otherPatient = await createTestPatient();
    await expect(
      insertAppointment({
        patientId: otherPatient.id, doctorId: doctor.id, branchId: escalon.id,
        createdBy: receptionist.id, startsAt: `${DAY} 08:00`,
      }),
    ).rejects.toMatchObject({ code: EXCLUSION_VIOLATION });
  });

  it('permite citas seguidas del mismo médico, incluso en otra sucursal', async () => {
    const { doctor, book } = await scene();
    await book({ startsAt: `${DAY} 08:00`, branchId: central.id });
    const otherPatient = await createTestPatient();
    await expect(
      insertAppointment({
        patientId: otherPatient.id, doctorId: doctor.id, branchId: escalon.id,
        createdBy: receptionist.id, startsAt: `${DAY} 08:30`,
      }),
    ).resolves.toBeTruthy();
    await expect(book({ startsAt: `${DAY} 07:30` })).resolves.toBeTruthy(); // la anterior también
  });

  it('dos médicos distintos sí pueden tener citas a la misma hora', async () => {
    const first = await scene();
    const second = await scene();
    await first.book();
    await expect(second.book()).resolves.toBeTruthy();
  });

  it('el mismo médico a la misma hora en otro día no es un cruce', async () => {
    const { book } = await scene();
    await book();
    await expect(book({ startsAt: '2030-03-05 08:00' })).resolves.toBeTruthy();
  });

  it('una cita cancelada libera el horario', async () => {
    const { doctor, book } = await scene();
    await book({ status: 'cancelled' });
    const otherPatient = await createTestPatient();
    await expect(
      insertAppointment({
        patientId: otherPatient.id, doctorId: doctor.id, branchId: central.id,
        createdBy: receptionist.id, startsAt: `${DAY} 08:00`,
      }),
    ).resolves.toBeTruthy();
  });

  it('cancelar una cita existente libera el horario, y reactivarla con el horario ocupado se rechaza', async () => {
    const { doctor, book } = await scene();
    const firstId = (await book()).rows[0].id;
    await pool.query(`UPDATE appointments SET status = 'cancelled' WHERE id = $1`, [firstId]);

    const otherPatient = await createTestPatient();
    await insertAppointment({
      patientId: otherPatient.id, doctorId: doctor.id, branchId: central.id,
      createdBy: receptionist.id, startsAt: `${DAY} 08:00`,
    });
    await expect(
      pool.query(`UPDATE appointments SET status = 'scheduled' WHERE id = $1`, [firstId]),
    ).rejects.toMatchObject({ code: EXCLUSION_VIOLATION });
  });

  it.each(['scheduled', 'completed', 'no_show'] as const)('una cita en estado %s ocupa el horario', async (status) => {
    const { doctor, book } = await scene();
    await book({ status });
    const otherPatient = await createTestPatient();
    await expect(
      insertAppointment({
        patientId: otherPatient.id, doctorId: doctor.id, branchId: central.id,
        createdBy: receptionist.id, startsAt: `${DAY} 08:00`,
      }),
    ).rejects.toMatchObject({ code: EXCLUSION_VIOLATION });
  });

  it('dos agendados simultáneos del mismo horario: uno gana y el otro se rechaza', async () => {
    const doctor = await createTestUser({ role: 'doctor', branchIds: [central.id] });
    const [patientA, patientB] = [await createTestPatient(), await createTestPatient()];
    const attempt = (patientId: string) =>
      insertAppointment({
        patientId, doctorId: doctor.id, branchId: central.id,
        createdBy: receptionist.id, startsAt: `${DAY} 10:00`,
      });
    const results = await Promise.allSettled([attempt(patientA.id), attempt(patientB.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: EXCLUSION_VIOLATION });
  });
});

describe('appointments: un paciente no está en dos citas a la vez', () => {
  it('rechaza dos citas del mismo paciente a la misma hora con médicos distintos', async () => {
    const { patient, book } = await scene();
    await book();
    const otherDoctor = await createTestUser({ role: 'doctor', branchIds: [escalon.id] });
    await expect(
      insertAppointment({
        patientId: patient.id, doctorId: otherDoctor.id, branchId: escalon.id,
        createdBy: receptionist.id, startsAt: `${DAY} 08:00`,
      }),
    ).rejects.toMatchObject({ code: EXCLUSION_VIOLATION });
  });

  it('permite al paciente tener citas seguidas o en otro día, y una nueva si la anterior se canceló', async () => {
    const { patient, book } = await scene();
    await book();
    const otherDoctor = await createTestUser({ role: 'doctor', branchIds: [central.id] });
    const withOther = (startsAt: string) =>
      insertAppointment({
        patientId: patient.id, doctorId: otherDoctor.id, branchId: central.id,
        createdBy: receptionist.id, startsAt,
      });
    await expect(withOther(`${DAY} 08:30`)).resolves.toBeTruthy();
    await expect(withOther('2030-03-06 08:00')).resolves.toBeTruthy();

    const cancelled = await scene();
    await cancelled.book({ status: 'cancelled' });
    await expect(
      insertAppointment({
        patientId: cancelled.patient.id, doctorId: otherDoctor.id, branchId: central.id,
        createdBy: receptionist.id, startsAt: `${DAY} 08:00`,
      }),
    ).resolves.toBeTruthy();
  });
});
