// =============================================================================
// consentimientos.prueba.ts
// Qué prueba:   las reglas de la tabla consents (migración 08): un solo
//               consentimiento vigente por paciente, la revocación guarda
//               siempre cuándo y quién, lo ya firmado no se reescribe y no se
//               puede borrar.
// Cómo:         inserta con SQL sobre la base de pruebas y comprueba el código
//               de error de PostgreSQL cuando una regla se rompe.
// =============================================================================
import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/configuracion/baseDatos';
import { createTestBranch, createTestUser, type TestUser } from '../ayudas/datosPrueba';
import { createTestPatient, insertConsent } from '../ayudas/datosClinicos';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const INSUFFICIENT_PRIVILEGE = '42501';

let staff: TestUser;
let other: TestUser;

beforeAll(async () => {
  const branch = await createTestBranch();
  staff = await createTestUser({ role: 'recepcionista', branchIds: [branch.id] });
  other = await createTestUser({ role: 'doctor', branchIds: [branch.id] });
});

const stored = async (id: string) => (await pool.query('SELECT * FROM consents WHERE id = $1', [id])).rows[0];
const revokeSql = (id: string, by: string) =>
  pool.query(`UPDATE consents SET revoked_at = now() AT TIME ZONE 'America/El_Salvador', revoked_by = $2 WHERE id = $1`, [id, by]);

describe('consents — datos', () => {
  it('guarda el consentimiento vigente: quién lo registró, la nota y la hora', async () => {
    const patient = await createTestPatient();
    const id = (await insertConsent({ patientId: patient.id, grantedBy: staff.id, note: 'Firmó el formulario' })).rows[0].id;
    expect(await stored(id)).toMatchObject({ patient_id: patient.id, granted_by: staff.id, note: 'Firmó el formulario', revoked_at: null, revoked_by: null });
    expect((await stored(id)).created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });

  it('la nota es opcional, pero no puede ser solo espacios', async () => {
    const patient = await createTestPatient();
    const id = (await insertConsent({ patientId: patient.id, grantedBy: staff.id })).rows[0].id;
    expect((await stored(id)).note).toBeNull();
    const other2 = await createTestPatient();
    await expect(insertConsent({ patientId: other2.id, grantedBy: staff.id, note: '   ' })).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('la nota no pasa de 200 caracteres', async () => {
    const patient = await createTestPatient();
    await expect(insertConsent({ patientId: patient.id, grantedBy: staff.id, note: 'x'.repeat(201) })).rejects.toMatchObject({ code: '22001' });
    await expect(insertConsent({ patientId: patient.id, grantedBy: staff.id, note: 'x'.repeat(200) })).resolves.toBeDefined();
  });
});

describe('consents — uno vigente por paciente', () => {
  it('rechaza un segundo consentimiento vigente del mismo paciente', async () => {
    const patient = await createTestPatient();
    await insertConsent({ patientId: patient.id, grantedBy: staff.id });
    await expect(insertConsent({ patientId: patient.id, grantedBy: other.id })).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('otro paciente sí puede tener el suyo', async () => {
    const a = await createTestPatient();
    const b = await createTestPatient();
    await insertConsent({ patientId: a.id, grantedBy: staff.id });
    await expect(insertConsent({ patientId: b.id, grantedBy: staff.id })).resolves.toBeDefined();
  });

  it('después de revocar, el paciente puede tener uno nuevo y el viejo queda como historia', async () => {
    const patient = await createTestPatient();
    const first = (await insertConsent({ patientId: patient.id, grantedBy: staff.id })).rows[0].id;
    await revokeSql(first, other.id);
    await expect(insertConsent({ patientId: patient.id, grantedBy: staff.id })).resolves.toBeDefined();
    const rows = (await pool.query('SELECT revoked_at FROM consents WHERE patient_id = $1', [patient.id])).rows;
    expect(rows).toHaveLength(2);
  });
});

describe('consents — revocación', () => {
  it('al revocar quedan la hora y quién, y lo demás no cambia', async () => {
    const patient = await createTestPatient();
    const id = (await insertConsent({ patientId: patient.id, grantedBy: staff.id, note: 'Nota' })).rows[0].id;
    const before = await stored(id);
    await revokeSql(id, other.id);
    const after = await stored(id);
    expect(after.revoked_by).toBe(other.id);
    expect(after.revoked_at).toMatch(/^\d{4}-\d{2}-\d{2} /);
    expect({ ...after, revoked_at: null, revoked_by: null }).toEqual({ ...before, revoked_at: null, revoked_by: null });
  });

  it('la hora y quién deben guardarse juntos', async () => {
    const patient = await createTestPatient();
    const id = (await insertConsent({ patientId: patient.id, grantedBy: staff.id })).rows[0].id;
    await expect(pool.query(`UPDATE consents SET revoked_at = now() WHERE id = $1`, [id])).rejects.toMatchObject({ code: CHECK_VIOLATION });
    // Solo "quién", sin hora: no es una revocación, y el disparador la frena.
    await expect(pool.query(`UPDATE consents SET revoked_by = $2 WHERE id = $1`, [id, other.id])).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });

  it('no se puede revocar con una hora anterior a la de creación', async () => {
    const patient = await createTestPatient();
    const id = (await insertConsent({ patientId: patient.id, grantedBy: staff.id })).rows[0].id;
    await expect(
      pool.query(`UPDATE consents SET revoked_at = created_at - interval '1 hour', revoked_by = $2 WHERE id = $1`, [id, other.id]),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('una revocación no se deshace ni se reescribe', async () => {
    const patient = await createTestPatient();
    const id = (await insertConsent({ patientId: patient.id, grantedBy: staff.id })).rows[0].id;
    await revokeSql(id, other.id);
    await expect(pool.query(`UPDATE consents SET revoked_at = NULL, revoked_by = NULL WHERE id = $1`, [id])).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    await expect(revokeSql(id, staff.id)).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    expect((await stored(id)).revoked_by).toBe(other.id);
  });
});

describe('consents — lo firmado no se reescribe ni se borra', () => {
  it.each([
    ['la nota', `UPDATE consents SET note = 'Otra' WHERE id = $1`],
    ['quién lo registró', `UPDATE consents SET granted_by = '${'00000000-0000-0000-0000-000000000000'}' WHERE id = $1`],
    ['la fecha de creación', `UPDATE consents SET created_at = created_at - interval '1 day' WHERE id = $1`],
  ])('no se puede cambiar %s', async (_name, sql) => {
    const patient = await createTestPatient();
    const id = (await insertConsent({ patientId: patient.id, grantedBy: staff.id, note: 'Nota' })).rows[0].id;
    await expect(pool.query(sql, [id])).rejects.toBeDefined();
    expect((await stored(id)).note).toBe('Nota');
  });

  it('no se puede cambiar de paciente', async () => {
    const a = await createTestPatient();
    const b = await createTestPatient();
    const id = (await insertConsent({ patientId: a.id, grantedBy: staff.id })).rows[0].id;
    await expect(pool.query(`UPDATE consents SET patient_id = $2 WHERE id = $1`, [id, b.id])).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });

  it('no se puede cambiar la nota mientras se revoca', async () => {
    const patient = await createTestPatient();
    const id = (await insertConsent({ patientId: patient.id, grantedBy: staff.id, note: 'Nota' })).rows[0].id;
    await expect(
      pool.query(`UPDATE consents SET note = 'Cambiada', revoked_at = now(), revoked_by = $2 WHERE id = $1`, [id, other.id]),
    ).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });

  it('no se puede borrar (permisos) ni vaciar la tabla', async () => {
    const patient = await createTestPatient();
    const id = (await insertConsent({ patientId: patient.id, grantedBy: staff.id })).rows[0].id;
    await expect(pool.query('DELETE FROM consents WHERE id = $1', [id])).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    await expect(pool.query('TRUNCATE consents')).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    expect(await stored(id)).toBeDefined();
  });
});
