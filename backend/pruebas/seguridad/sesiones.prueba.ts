// =============================================================================
// sesiones.prueba.ts
// Qué prueba:   que restablecer la contraseña de un usuario CIERRA sus sesiones
//               abiertas: un token emitido antes del restablecimiento deja de
//               servir (401), mientras que el inicio de sesión nuevo funciona.
// Por qué:      si alguien robó una contraseña o un token, el administrador debe
//               poder cortarle el acceso sin esperar las 8 horas del token.
// Cómo:         se crean tokens con una hora de emisión (iat) en el pasado, por
//               HTTP real, y se compara el antes y el después.
// Depende de:   app.ts, migración 11 (users.sessions_revoked_at).
// =============================================================================
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import { env } from '../../src/configuracion/entorno';
import type { Role } from '../../src/configuracion/roles';
import { signToken } from '../../src/utilidades/token';
import { createTestBranch, createTestUser, type TestBranch } from '../ayudas/datosPrueba';

const app = createApp();
const NEW_PASSWORD = 'clave-nueva-segura-77';
// /me resuelve la sucursal, así que se envía el encabezado con la sucursal del usuario.
let branch: TestBranch;
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Sucursal-Id': branch.id });
// Usuario de recepción asignado a la sucursal de prueba.
const receptionist = () => createTestUser({ role: 'recepcionista', branchIds: [branch.id] });
const nowSeconds = () => Math.floor(Date.now() / 1000);

// Token con hora de emisión elegida (para simular uno viejo).
function tokenIssuedAt(user: { id: string; email: string }, role: Role, iat: number): string {
  return jwt.sign({ userId: user.id, email: user.email, role, iat }, env.JWT_SECRET, { expiresIn: '8h' });
}

describe('cierre de sesiones al restablecer la contraseña', () => {
  beforeAll(async () => { branch = await createTestBranch(); });

  it('el token de antes del restablecimiento deja de servir, el nuevo sí', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const victim = await receptionist();
    const adminToken = signToken({ userId: admin.id, email: admin.email, role: 'admin' });
    const oldToken = tokenIssuedAt(victim, 'recepcionista', nowSeconds() - 60);

    // Antes: el token viejo sirve.
    expect((await request(app).get('/api/auth/me').set(auth(oldToken))).status).toBe(200);

    const reset = await request(app)
      .put(`/api/usuarios/${victim.id}/contrasena`).set(auth(adminToken)).send({ password: NEW_PASSWORD });
    expect(reset.status).toBe(200);

    // Después: el token viejo ya no sirve.
    const after = await request(app).get('/api/auth/me').set(auth(oldToken));
    expect(after.status).toBe(401);

    // La contraseña vieja no entra y la nueva sí; el token nuevo funciona.
    const login = await request(app).post('/api/auth/login').send({ email: victim.email, password: NEW_PASSWORD });
    expect(login.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set(auth(login.body.data.token));
    expect(me.status).toBe(200);
  });

  it('un token emitido en el mismo segundo del cierre sigue valiendo (no se cierra el inicio de sesión nuevo)', async () => {
    const user = await receptionist();
    await pool.query('UPDATE users SET sessions_revoked_at = now() WHERE id = $1', [user.id]);
    const sameSecond = tokenIssuedAt(user, 'recepcionista', nowSeconds());
    expect((await request(app).get('/api/auth/me').set(auth(sameSecond))).status).toBe(200);
  });

  it('un token emitido antes del cierre se rechaza aunque no haya vencido', async () => {
    const user = await receptionist();
    await pool.query('UPDATE users SET sessions_revoked_at = now() WHERE id = $1', [user.id]);
    const older = tokenIssuedAt(user, 'recepcionista', nowSeconds() - 5);
    expect((await request(app).get('/api/auth/me').set(auth(older))).status).toBe(401);
  });

  it('no afecta a las sesiones de otros usuarios', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const victim = await receptionist();
    const bystander = await receptionist();
    const bystanderToken = tokenIssuedAt(bystander, 'recepcionista', nowSeconds() - 60);
    await request(app).put(`/api/usuarios/${victim.id}/contrasena`)
      .set(auth(signToken({ userId: admin.id, email: admin.email, role: 'admin' })))
      .send({ password: NEW_PASSWORD });
    expect((await request(app).get('/api/auth/me').set(auth(bystanderToken))).status).toBe(200);
  });

  it('un usuario sin cierre previo (NULL) conserva sus sesiones', async () => {
    const user = await receptionist();
    const token = tokenIssuedAt(user, 'recepcionista', nowSeconds() - 3600);
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(200);
  });

  it('la respuesta de /me nunca expone sessions_revoked', async () => {
    const user = await receptionist();
    await pool.query('UPDATE users SET sessions_revoked_at = now() - interval \'1 hour\' WHERE id = $1', [user.id]);
    const token = signToken({ userId: user.id, email: user.email, role: 'recepcionista' });
    const me = await request(app).get('/api/auth/me').set(auth(token));
    expect(me.status).toBe(200);
    expect(JSON.stringify(me.body)).not.toMatch(/sessions_revoked/);
  });
});
