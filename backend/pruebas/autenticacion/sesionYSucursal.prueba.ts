// =============================================================================
// sesionYSucursal.prueba.ts
// Qué prueba:   (a) que authenticate rechaza tokens falsos, vencidos, de
//               usuarios desactivados y que toma el rol ACTUAL de la base, y
//               (b) que la sucursal activa se elige bien y NUNCA se concede una
//               a la que el usuario no tiene acceso.
// Cómo:         por HTTP sobre GET /api/auth/me, que usa authenticate y
//               resolveBranchScope.
// Depende de:   app.ts, token.ts y ayudas/datosPrueba.ts.
// =============================================================================
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import { env } from '../../src/configuracion/entorno';
import { buildPermissions } from '../../src/configuracion/permisos';
import { authenticate, createCan } from '../../src/intermediarios/autenticacion';
import { signToken } from '../../src/utilidades/token';
import { createTestBranch, createTestUser } from '../ayudas/datosPrueba';

const app = createApp();

// Llama a /api/auth/me con un token y, opcionalmente, una sucursal elegida.
const me = (token?: string, branchId?: string) => {
  const call = request(app).get('/api/auth/me');
  if (token) call.set('Authorization', `Bearer ${token}`);
  if (branchId) call.set('X-Sucursal-Id', branchId);
  return call;
};

// Token válido para un usuario de prueba.
const tokenFor = (user: { id: string; email: string }, role: 'doctor' | 'admin' | 'recepcionista' = 'recepcionista') =>
  signToken({ userId: user.id, email: user.email, role });

describe('authenticate: tokens', () => {
  it('sin token: 401', async () => {
    expect((await me()).status).toBe(401);
  });

  it('con un texto cualquiera como token: 401', async () => {
    expect((await me('esto-no-es-un-token')).status).toBe(401);
  });

  it('firmado con OTRA clave: 401', async () => {
    const branch = await createTestBranch();
    const user = await createTestUser({ branchIds: [branch.id] });
    const forged = jwt.sign(
      { userId: user.id, email: user.email, role: 'admin' },
      'una-clave-que-no-es-la-del-servidor-0123456789',
    );
    expect((await me(forged)).status).toBe(401);
  });

  it('con algoritmo "none" (sin firma): 401', async () => {
    const branch = await createTestBranch();
    const user = await createTestUser({ branchIds: [branch.id] });
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
      userId: user.id, email: user.email, role: 'admin',
    })}.`;
    expect((await me(unsigned)).status).toBe(401);
  });

  it('vencido: 401', async () => {
    const branch = await createTestBranch();
    const user = await createTestUser({ branchIds: [branch.id] });
    const expired = jwt.sign(
      { userId: user.id, email: user.email, role: 'recepcionista' },
      env.JWT_SECRET,
      { expiresIn: -10 },
    );
    expect((await me(expired)).status).toBe(401);
  });

  it('el usuario se desactiva DESPUÉS de recibir su token: el token deja de servir', async () => {
    const branch = await createTestBranch();
    const user = await createTestUser({ branchIds: [branch.id] });
    const token = tokenFor(user);
    expect((await me(token)).status).toBe(200);

    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);

    expect((await me(token)).status).toBe(401);
  });

  it('el rol sale de la base, no del token: un token que dice "admin" no da poder', async () => {
    const branch = await createTestBranch();
    const user = await createTestUser({ role: 'recepcionista', branchIds: [branch.id] });
    const inflatedToken = tokenFor(user, 'admin'); // el token afirma ser admin

    // Ruta mínima protegida con el authenticate REAL y una capacidad que solo
    // tiene el administrador (users_manage). Si authenticate creyera al token,
    // respondería 200.
    const protectedApp = express();
    protectedApp.get(
      '/solo-admin',
      authenticate,
      createCan(buildPermissions('demostracion'))('users_manage'),
      (_req, res) => {
        res.json({ ok: true });
      },
    );

    const response = await request(protectedApp)
      .get('/solo-admin')
      .set('Authorization', `Bearer ${inflatedToken}`);

    expect(response.status).toBe(403);
    // Y /me confirma el rol real.
    expect((await me(inflatedToken)).body.data.user.role).toBe('recepcionista');
  });

  it('si a un usuario le cambian el rol DESPUÉS de iniciar sesión, vale el rol nuevo', async () => {
    const branch = await createTestBranch();
    const user = await createTestUser({ role: 'doctor', branchIds: [branch.id] });
    const token = tokenFor(user, 'doctor');

    const protectedApp = express();
    protectedApp.get(
      '/expedientes',
      authenticate,
      createCan(buildPermissions('demostracion'))('medical_records_read'),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    const call = () => request(protectedApp).get('/expedientes').set('Authorization', `Bearer ${token}`);

    expect((await call()).status).toBe(200);
    await pool.query(`UPDATE users SET role = 'recepcionista' WHERE id = $1`, [user.id]);
    expect((await call()).status).toBe(403);
  });
});

describe('resolveBranchScope: sucursal activa', () => {
  it('sin cabecera se usa la sucursal predeterminada', async () => {
    const first = await createTestBranch();
    const second = await createTestBranch();
    const user = await createTestUser({ role: 'doctor', branchIds: [first.id, second.id] });

    const response = await me(tokenFor(user, 'doctor'));

    expect(response.body.data.activeBranchId).toBe(first.id);
  });

  it('con cabecera se puede cambiar a otra sucursal asignada', async () => {
    const first = await createTestBranch();
    const second = await createTestBranch();
    const user = await createTestUser({ role: 'doctor', branchIds: [first.id, second.id] });

    const response = await me(tokenFor(user, 'doctor'), second.id);

    expect(response.status).toBe(200);
    expect(response.body.data.activeBranchId).toBe(second.id);
  });

  it('pedir una sucursal que NO tiene asignada: 403', async () => {
    const mine = await createTestBranch();
    const notMine = await createTestBranch();
    const user = await createTestUser({ role: 'recepcionista', branchIds: [mine.id] });

    const response = await me(tokenFor(user), notMine.id);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('No tiene acceso a esa sucursal.');
  });

  it('una cabecera con basura (no es un id) también da 403, no un error de base de datos', async () => {
    const branch = await createTestBranch();
    const user = await createTestUser({ branchIds: [branch.id] });
    const response = await me(tokenFor(user), "' OR 1=1 --");
    expect(response.status).toBe(403);
  });

  it('se le quita una sucursal DESPUÉS de iniciar sesión: pierde el acceso de inmediato', async () => {
    const first = await createTestBranch();
    const second = await createTestBranch();
    const user = await createTestUser({ role: 'doctor', branchIds: [first.id, second.id] });
    const token = tokenFor(user, 'doctor');
    expect((await me(token, second.id)).status).toBe(200);

    await pool.query('DELETE FROM user_branches WHERE user_id = $1 AND branch_id = $2', [user.id, second.id]);

    expect((await me(token, second.id)).status).toBe(403);
  });

  it('el administrador puede usar cualquier sucursal ACTIVA, pero no una inactiva', async () => {
    const own = await createTestBranch();
    const active = await createTestBranch();
    const inactive = await createTestBranch(false);
    const admin = await createTestUser({ role: 'admin', branchIds: [own.id] });
    const token = tokenFor(admin, 'admin');

    expect((await me(token, active.id)).body.data.activeBranchId).toBe(active.id);
    expect((await me(token, inactive.id)).status).toBe(403);
  });

  it('un usuario sin sucursales (que no es admin) recibe 403 en /me', async () => {
    const user = await createTestUser({ role: 'recepcionista', branchIds: [] });
    const response = await me(tokenFor(user));
    expect(response.status).toBe(403);
  });

  it('la respuesta incluye los datos de las sucursales (nombre, color, óptica)', async () => {
    const branch = await createTestBranch();
    const user = await createTestUser({ branchIds: [branch.id] });

    const response = await me(tokenFor(user));

    expect(response.body.data.branches[0]).toMatchObject({
      id: branch.id,
      code: branch.code,
      theme_color: '#0F766E',
      has_optical_counter: false,
    });
  });
});
