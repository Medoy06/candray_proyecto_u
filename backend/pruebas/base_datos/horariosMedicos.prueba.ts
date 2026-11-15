// =============================================================================
// horariosMedicos.prueba.ts
// Qué prueba:   las reglas de la tabla doctor_schedules (migración 04): días de
//               1 a 7, hora de inicio antes de la de fin, bloques en horas
//               enteras o medias, y que un médico no tenga dos bloques cruzados
//               el mismo día (ni siquiera en sucursales distintas).
// Cómo:         inserta con SQL sobre la base de pruebas y comprueba el código
//               de error de PostgreSQL cuando una regla se rompe.
// =============================================================================
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestBranch, createTestUser, type TestBranch, type TestUser } from '../ayudas/datosPrueba';
import { insertSchedule } from '../ayudas/datosClinicos';

const CHECK_VIOLATION = '23514';
const EXCLUSION_VIOLATION = '23P01';
const FOREIGN_KEY_VIOLATION = '23503';

let central: TestBranch;
let escalon: TestBranch;

beforeAll(async () => {
  central = await createTestBranch();
  escalon = await createTestBranch();
});

// Cada prueba usa un médico propio, así los bloques de una no chocan con los de otra.
const newDoctor = () => createTestUser({ role: 'doctor', branchIds: [central.id, escalon.id] });
const block = (doctor: TestUser, overrides: Partial<Parameters<typeof insertSchedule>[0]> = {}) =>
  insertSchedule({ doctorId: doctor.id, branchId: central.id, weekday: 1, start: '08:00', end: '12:00', ...overrides });

describe('doctor_schedules: datos válidos', () => {
  it('guarda un bloque semanal', async () => {
    const doctor = await newDoctor();
    const result = await block(doctor);
    expect(result.rows[0].id).toBeTruthy();
  });

  it('acepta los días 1 (lunes) y 7 (domingo) y rechaza 0 y 8', async () => {
    const doctor = await newDoctor();
    await expect(block(doctor, { weekday: 1 })).resolves.toBeTruthy();
    await expect(block(doctor, { weekday: 7 })).resolves.toBeTruthy();
    await expect(block(doctor, { weekday: 0 })).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(block(doctor, { weekday: 8 })).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('rechaza un bloque donde el inicio no es anterior al fin', async () => {
    const doctor = await newDoctor();
    await expect(block(doctor, { start: '12:00', end: '12:00' })).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(block(doctor, { start: '14:00', end: '12:00' })).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it.each([
    ['08:15', '12:00'],
    ['08:00', '12:45'],
    ['08:10', '09:00'],
  ])('rechaza el bloque %s-%s: no empieza o termina en hora entera o media', async (start, end) => {
    const doctor = await newDoctor();
    await expect(block(doctor, { start, end })).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('acepta un bloque de una sola media hora y bloques que terminan en y media', async () => {
    const doctor = await newDoctor();
    await expect(block(doctor, { start: '08:00', end: '08:30' })).resolves.toBeTruthy();
    await expect(block(doctor, { start: '14:30', end: '17:30' })).resolves.toBeTruthy();
  });

  it('exige un médico y una sucursal que existan', async () => {
    const doctor = await newDoctor();
    const missing = '00000000-0000-4000-8000-000000000000';
    await expect(block(doctor, { doctorId: missing })).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    await expect(block(doctor, { branchId: missing })).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });
});

describe('doctor_schedules: un médico no está en dos lugares a la vez', () => {
  it('rechaza un bloque que se cruza con otro del mismo día', async () => {
    const doctor = await newDoctor();
    await block(doctor, { start: '08:00', end: '12:00' });
    await expect(block(doctor, { start: '11:30', end: '13:00' })).rejects.toMatchObject({ code: EXCLUSION_VIOLATION });
    await expect(block(doctor, { start: '07:00', end: '08:30' })).rejects.toMatchObject({ code: EXCLUSION_VIOLATION });
    await expect(block(doctor, { start: '09:00', end: '10:00' })).rejects.toMatchObject({ code: EXCLUSION_VIOLATION });
  });

  it('rechaza el cruce aunque el segundo bloque sea en OTRA sucursal', async () => {
    const doctor = await newDoctor();
    await block(doctor, { branchId: central.id, start: '08:00', end: '12:00' });
    await expect(
      block(doctor, { branchId: escalon.id, start: '10:00', end: '14:00' }),
    ).rejects.toMatchObject({ code: EXCLUSION_VIOLATION });
  });

  it('permite bloques seguidos (uno termina cuando empieza el otro), incluso en otra sucursal', async () => {
    const doctor = await newDoctor();
    await block(doctor, { branchId: central.id, start: '08:00', end: '12:00' });
    await expect(block(doctor, { branchId: escalon.id, start: '12:00', end: '14:00' })).resolves.toBeTruthy();
    await expect(block(doctor, { branchId: central.id, start: '07:00', end: '08:00' })).resolves.toBeTruthy();
  });

  it('el mismo horario en otro día de la semana no es un cruce', async () => {
    const doctor = await newDoctor();
    await block(doctor, { weekday: 1 });
    await expect(block(doctor, { weekday: 2 })).resolves.toBeTruthy();
  });

  it('dos médicos distintos pueden tener el mismo horario', async () => {
    const [first, second] = [await newDoctor(), await newDoctor()];
    await block(first);
    await expect(block(second)).resolves.toBeTruthy();
  });
});
