// =============================================================================
// erroresYPermisos.prueba.ts
// Qué prueba:   (a) el manejador único de errores: no filtra detalles internos
//               y traduce errores conocidos a códigos 4xx; (b) el límite de
//               tamaño del cuerpo y el limitador de inicio de sesión por IP;
//               (c) que can() usa el perfil de permisos correcto.
// Cómo:         con aplicaciones Express pequeñas armadas dentro de la prueba
//               (para los errores y can) y con createApp (para los límites).
// Depende de:   intermediarios/errores.ts, autenticacion.ts y app.ts.
// =============================================================================
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import { buildPermissions } from '../../src/configuracion/permisos';
import type { Role } from '../../src/configuracion/roles';
import { createCan } from '../../src/intermediarios/autenticacion';
import { AppError, errorHandler } from '../../src/intermediarios/errores';
import { createTestUser } from '../ayudas/datosPrueba';

// El manejador escribe cada error en la consola; en las pruebas se silencia.
afterEach(() => vi.restoreAllMocks());

describe('Manejador único de errores', () => {
  // Aplicación pequeña con rutas que fallan de distintas maneras.
  const app = express();
  app.get('/inesperado', () => {
    throw new Error('detalle interno: SELECT * FROM users');
  });
  app.get('/asincrono', async () => {
    throw new AppError('Ya existe esa cita.', 409);
  });
  app.get('/duplicado', async () => {
    throw Object.assign(new Error('duplicate key'), { code: '23505' });
  });
  app.get('/choque', async () => {
    throw Object.assign(new Error('exclusion'), { code: '23P01' });
  });
  app.use(errorHandler);

  it('un error inesperado da 500 genérico y NO filtra el detalle interno', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await request(app).get('/inesperado');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, message: 'Error interno del servidor.' });
    expect(JSON.stringify(response.body)).not.toContain('SELECT');
  });

  it('un AppError lanzado en una función async llega con su código (Express 5)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await request(app).get('/asincrono');
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Ya existe esa cita.');
  });

  it('valor único repetido en la base: 409', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await request(app).get('/duplicado')).status).toBe(409);
  });

  it('choque de horario (restricción de exclusión): 409', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await request(app).get('/choque')).status).toBe(409);
  });
});

describe('Límites de la API', () => {
  const app = createApp();

  it('un JSON mal formado da 400', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(response.status).toBe(400);
  });

  it('un cuerpo de más de 100 kb da 413', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const huge = { email: 'a@prueba.test', password: 'x'.repeat(200 * 1024) };
    const response = await request(app).post('/api/auth/login').send(huge);
    expect(response.status).toBe(413);
  });

  it('una ruta inexistente da 404 en JSON', async () => {
    const response = await request(app).get('/api/no-existe');
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  it('el limitador por IP bloquea con 429 y deja UNA sola fila de auditoría', async () => {
    const limited = createApp({ authRateLimitMax: 3 });
    const user = await createTestUser();

    const statuses: number[] = [];
    for (let attempt = 1; attempt <= 6; attempt++) {
      const response = await request(limited)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'incorrecta' });
      statuses.push(response.status);
    }

    expect(statuses).toEqual([401, 401, 401, 429, 429, 429]);
    // El registro se escribe sin esperar (fire-and-forget); se deja pasar un instante.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const rows = await pool.query(
      `SELECT count(*)::int AS n FROM audit_log
        WHERE action = 'login_rate_limited' AND detail->>'limit' = '3'`,
    );
    expect(rows.rows[0].n).toBe(1);
  });
});

describe('can(): el perfil de permisos decide', () => {
  // Aplicación pequeña: un "autenticador" falso toma el rol de la cabecera
  // x-rol y la ruta exige la capacidad medical_records_read.
  const buildApp = (profile: 'demostracion' | 'estricto') => {
    const can = createCan(buildPermissions(profile));
    const app = express();
    app.use((req, _res, next) => {
      const role = req.headers['x-rol'] as Role | undefined;
      if (role) req.user = { userId: '00000000-0000-0000-0000-000000000000', email: 'x@prueba.test', role };
      next();
    });
    app.get('/expedientes', can('medical_records_read'), (_req, res) => {
      res.json({ ok: true });
    });
    return app;
  };

  it('sin usuario: 401', async () => {
    expect((await request(buildApp('demostracion')).get('/expedientes')).status).toBe(401);
  });

  it('el médico puede en los dos perfiles', async () => {
    for (const profile of ['demostracion', 'estricto'] as const) {
      const response = await request(buildApp(profile)).get('/expedientes').set('x-rol', 'doctor');
      expect(response.status).toBe(200);
    }
  });

  it('el administrador puede en demostración y NO en estricto', async () => {
    const demo = await request(buildApp('demostracion')).get('/expedientes').set('x-rol', 'admin');
    const strict = await request(buildApp('estricto')).get('/expedientes').set('x-rol', 'admin');
    expect(demo.status).toBe(200);
    expect(strict.status).toBe(403);
  });

  it('recepción, óptica y directivo reciben 403 en los dos perfiles', async () => {
    for (const profile of ['demostracion', 'estricto'] as const) {
      for (const role of ['recepcionista', 'encargado_venta', 'directivo']) {
        const response = await request(buildApp(profile)).get('/expedientes').set('x-rol', role);
        expect(response.status).toBe(403);
      }
    }
  });
});
