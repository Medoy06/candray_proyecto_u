// =============================================================================
// interconsultas.prueba.ts
// Qué prueba:   las reglas de la tabla referrals (migración 07): el motivo es
//               obligatorio, el médico que recibe no es el que concede, la
//               vigencia termina después de que empieza, y la revocación
//               guarda siempre cuándo y quién.
// Cómo:         inserta con SQL sobre la base de pruebas y comprueba el código
//               de error de PostgreSQL cuando una regla se rompe.
// =============================================================================
import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/configuracion/baseDatos';
import { createTestBranch, createTestUser, type TestUser } from '../ayudas/datosPrueba';
import { createTestPatient, insertReferral } from '../ayudas/datosClinicos';

const CHECK_VIOLATION = '23514';

let granter: TestUser;
let provider: TestUser;

beforeAll(async () => {
  const branch = await createTestBranch();
  granter = await createTestUser({ role: 'doctor', branchIds: [branch.id] });
  provider = await createTestUser({ role: 'doctor', branchIds: [branch.id] });
});

describe('referrals', () => {
  it('guarda la interconsulta vigente y sin revocar', async () => {
    const patient = await createTestPatient();
    const id = (
      await insertReferral({ patientId: patient.id, providerId: provider.id, grantedBy: granter.id })
    ).rows[0].id;
    const row = (await pool.query('SELECT * FROM referrals WHERE id = $1', [id])).rows[0];
    expect(row).toMatchObject({ patient_id: patient.id, provider_id: provider.id, granted_by: granter.id });
    expect(row.revoked_at).toBeNull();
    expect(row.expires_at > row.created_at).toBe(true);
  });

  it.each(['', '  ', 'ab'])('rechaza un motivo vacío o demasiado corto (%j)', async (reason) => {
    const patient = await createTestPatient();
    await expect(
      insertReferral({ patientId: patient.id, providerId: provider.id, grantedBy: granter.id, reason }),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('un médico no se puede dar acceso a sí mismo', async () => {
    const patient = await createTestPatient();
    await expect(
      insertReferral({ patientId: patient.id, providerId: granter.id, grantedBy: granter.id }),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('la vigencia debe terminar en el futuro', async () => {
    const patient = await createTestPatient();
    await expect(
      insertReferral({
        patientId: patient.id, providerId: provider.id, grantedBy: granter.id, expiresAt: '2020-01-01 00:00',
      }),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('al revocar deben guardarse la hora y quién (las dos columnas juntas)', async () => {
    const patient = await createTestPatient();
    const id = (
      await insertReferral({ patientId: patient.id, providerId: provider.id, grantedBy: granter.id })
    ).rows[0].id;
    await expect(
      pool.query(`UPDATE referrals SET revoked_at = now() WHERE id = $1`, [id]),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(
      pool.query(`UPDATE referrals SET revoked_by = $2 WHERE id = $1`, [id, granter.id]),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await pool.query(`UPDATE referrals SET revoked_at = now(), revoked_by = $2 WHERE id = $1`, [id, granter.id]);
    const row = (await pool.query('SELECT revoked_at, revoked_by FROM referrals WHERE id = $1', [id])).rows[0];
    expect(row.revoked_by).toBe(granter.id);
    expect(row.revoked_at).not.toBeNull();
  });
});
