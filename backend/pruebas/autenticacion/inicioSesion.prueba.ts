// =============================================================================
// inicioSesion.prueba.ts
// Qué prueba:   el endpoint POST /api/auth/login completo, por HTTP:
//               credenciales correctas, mensajes que no revelan si el correo
//               existe, bloqueo de cuenta (423) y desbloqueo, y lo que queda
//               en la auditoría.
// Cómo:         supertest llama a la aplicación sin abrir un puerto, contra la
//               base de datos de pruebas real.
// Depende de:   app.ts y ayudas/datosPrueba.ts.
// =============================================================================
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import { verifyToken } from '../../src/utilidades/token';
import { createTestBranch, createTestUser, TEST_PASSWORD } from '../ayudas/datosPrueba';

const app = createApp();

// Intenta iniciar sesión; devuelve la respuesta HTTP.
const login = (email: string, password: string) =>
  request(app).post('/api/auth/login').send({ email, password });

// Cuenta las filas de auditoría de una acción para una cuenta (detail.account_id).
async function countAudit(action: string, accountId: string): Promise<number> {
  const result = await pool.query(
    `SELECT count(*)::int AS n FROM audit_log
      WHERE action = $1 AND (detail->>'account_id' = $2 OR entity_id::text = $2 OR actor_id::text = $2)`,
    [action, accountId],
  );
  return result.rows[0].n;
}

describe('Inicio de sesión correcto', () => {
  it('devuelve token, usuario sin contraseña, sus sucursales y la predeterminada', async () => {
    const central = await createTestBranch();
    const otra = await createTestBranch();
    const user = await createTestUser({ role: 'doctor', branchIds: [central.id, otra.id] });

    const response = await login(user.email, TEST_PASSWORD);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    // El token lleva exactamente la identidad del usuario.
    expect(verifyToken(response.body.data.token)).toMatchObject({
      userId: user.id,
      email: user.email,
      role: 'doctor',
    });
    expect(response.body.data.user).toEqual({
      id: user.id,
      full_name: 'Usuario de Prueba',
      email: user.email,
      role: 'doctor',
    });
    expect(JSON.stringify(response.body)).not.toContain('password');
    expect(response.body.data.activeBranchId).toBe(central.id);
    const ids = response.body.data.branches.map((b: { id: string }) => b.id);
    expect(ids).toEqual(expect.arrayContaining([central.id, otra.id]));
  });

  it('deja una fila login_success con la sucursal con la que entró', async () => {
    const branch = await createTestBranch();
    const user = await createTestUser({ branchIds: [branch.id] });

    await login(user.email, TEST_PASSWORD);

    const result = await pool.query(
      `SELECT branch_id FROM audit_log WHERE action = 'login_success' AND actor_id = $1`,
      [user.id],
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].branch_id).toBe(branch.id);
  });

  it('el correo se acepta sin distinguir mayúsculas', async () => {
    const branch = await createTestBranch();
    const user = await createTestUser({ branchIds: [branch.id] });
    const response = await login(user.email.toUpperCase(), TEST_PASSWORD);
    expect(response.status).toBe(200);
  });

  it('un usuario sin sucursales asignadas no recibe token (403)', async () => {
    const user = await createTestUser({ role: 'recepcionista', branchIds: [] });
    const response = await login(user.email, TEST_PASSWORD);
    expect(response.status).toBe(403);
    expect(response.body.data).toBeUndefined();
  });
});

describe('Fallos que no revelan nada', () => {
  it('contraseña incorrecta, correo inexistente y cuenta desactivada dan EXACTAMENTE la misma respuesta', async () => {
    const branch = await createTestBranch();
    const active = await createTestUser({ branchIds: [branch.id] });
    const disabled = await createTestUser({ branchIds: [branch.id], isActive: false });

    const badPassword = await login(active.email, 'otra-contrasena');
    const unknownEmail = await login('nadie@prueba.test', 'otra-contrasena');
    // Con la contraseña CORRECTA: una cuenta desactivada tampoco debe delatarse.
    const disabledAccount = await login(disabled.email, TEST_PASSWORD);

    for (const response of [badPassword, unknownEmail, disabledAccount]) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ success: false, message: 'Credenciales incorrectas.' });
    }
  });

  it('en la auditoría SÍ queda el motivo real de cada fallo', async () => {
    const branch = await createTestBranch();
    const user = await createTestUser({ branchIds: [branch.id] });

    await login(user.email, 'otra-contrasena');

    const result = await pool.query(
      `SELECT detail->>'reason' AS reason FROM audit_log
        WHERE action = 'login_failed' AND detail->>'account_id' = $1`,
      [user.id],
    );
    expect(result.rows.map((r) => r.reason)).toEqual(['bad_password']);
  });

  it('un cuerpo sin contraseña se rechaza con 400 y la lista de campos', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: 'a@prueba.test' });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Datos inválidos.');
    expect(response.body.errors[0].field).toBe('password');
  });
});

describe('Bloqueo de cuenta por HTTP', () => {
  it('5 fallos bloquean: el 5.º responde 423, y aun con la contraseña correcta no se entra', async () => {
    const branch = await createTestBranch();
    const user = await createTestUser({ branchIds: [branch.id] });

    for (let attempt = 1; attempt <= 4; attempt++) {
      const response = await login(user.email, 'incorrecta');
      expect(response.status).toBe(401);
    }
    const fifth = await login(user.email, 'incorrecta');
    expect(fifth.status).toBe(423);
    expect(fifth.body.message).toContain('bloqueada temporalmente');
    expect(fifth.body.retry_after_minutes).toBe(15);
    expect(fifth.headers['retry-after']).toBe('900');

    const withCorrectPassword = await login(user.email, TEST_PASSWORD);
    expect(withCorrectPassword.status).toBe(423);
    expect(withCorrectPassword.body.data).toBeUndefined();
  });

  it('el bloqueo queda en la auditoría una sola vez', async () => {
    const branch = await createTestBranch();
    const user = await createTestUser({ branchIds: [branch.id] });
    for (let attempt = 1; attempt <= 7; attempt++) await login(user.email, 'incorrecta');

    expect(await countAudit('account_locked', user.id)).toBe(1);
    // 5 fallos de contraseña + 2 rechazos por cuenta bloqueada.
    expect(await countAudit('login_failed', user.id)).toBe(7);
  });

  it('al terminar el bloqueo se puede entrar con la contraseña correcta', async () => {
    const branch = await createTestBranch();
    const user = await createTestUser({ branchIds: [branch.id] });
    for (let attempt = 1; attempt <= 5; attempt++) await login(user.email, 'incorrecta');

    // Se adelanta el reloj: el bloqueo terminó hace un minuto.
    await pool.query(
      `UPDATE users SET locked_until = (now() AT TIME ZONE 'America/El_Salvador') - interval '1 minute'
        WHERE id = $1`,
      [user.id],
    );

    const response = await login(user.email, TEST_PASSWORD);
    expect(response.status).toBe(200);
  });
});
