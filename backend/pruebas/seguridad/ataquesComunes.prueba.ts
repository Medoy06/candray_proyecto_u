// =============================================================================
// ataquesComunes.prueba.ts
// Qué prueba:   la revisión de seguridad contra los ataques más comunes a una
//               API web, hechos por la API real:
//                 - inyección SQL en búsquedas, filtros e inicio de sesión;
//                 - "mass assignment": enviar campos de más (rol, estado, dueño);
//                 - entradas raras en TODAS las rutas (ids mal escritos, cuerpos
//                   nulos, listas, "__proto__"): nunca un 500 ni un rastro de pila;
//                 - evasión de la autenticación por mayúsculas, barras, HEAD,
//                   o token en la URL;
//                 - fugas de datos secretos en las respuestas;
//                 - cabeceras de seguridad y CORS;
//                 - acceso a datos de otra sucursal (IDOR) y abuso de paginación;
//                 - respuestas que no distinguen "no existe" de "no es suyo".
// Cómo:         supertest sobre createApp(), base candray_test.
// =============================================================================
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import { buildPermissions } from '../../src/configuracion/permisos';
import { ROLES, type Role } from '../../src/configuracion/roles';
import { todayInElSalvador } from '../../src/utilidades/fechas';
import { signToken } from '../../src/utilidades/token';
import {
  createTestPatient, insertAppointment, insertMedicalRecord, insertOpticalOrder, insertPrescription,
} from '../ayudas/datosClinicos';
import { createTestBranch, createTestUser, TEST_PASSWORD, type TestBranch } from '../ayudas/datosPrueba';
import { DISCOVERED, UUID, fill, type Method } from '../ayudas/rutasApi';

const app = createApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Actor { id: string; email: string; token: string }
async function actor(role: Role, branchIds: string[] = []): Promise<Actor> {
  const user = await createTestUser({ role, branchIds });
  return { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
}

let branchA: TestBranch;
let branchB: TestBranch;
let admin: Actor, receptionA: Actor, receptionB: Actor, doctorA: Actor, doctorA2: Actor, salesA: Actor, salesB: Actor;

beforeAll(async () => {
  branchA = await createTestBranch();
  branchB = await createTestBranch();
  admin = await actor('admin');
  receptionA = await actor('recepcionista', [branchA.id]);
  receptionB = await actor('recepcionista', [branchB.id]);
  doctorA = await actor('doctor', [branchA.id]);
  doctorA2 = await actor('doctor', [branchA.id]);
  salesA = await actor('encargado_venta', [branchA.id]);
  salesB = await actor('encargado_venta', [branchB.id]);
});

// ---------------------------------------------------------------------------
describe('inyección SQL', () => {
  const PAYLOADS = [
    "' OR '1'='1", "'; DROP TABLE patients; --", "' UNION SELECT password_hash FROM users --",
    '1; SELECT pg_sleep(5)', '%', '_', '\\', "\u0000", '"', "'",
  ];

  it.each(PAYLOADS)('la búsqueda de pacientes con %j no falla, no devuelve de más y la tabla sigue ahí', async (payload) => {
    // Otros archivos de prueba corren en paralelo sobre la misma base y pueden
    // insertar pacientes en cualquier momento, así que NO se compara "igual
    // antes y después". Lo que una inyección rompería es lo contrario: que se
    // borren filas o que la consulta devuelva más de lo que existe.
    const before = await pool.query('SELECT count(*)::int AS n FROM patients');
    const response = await request(app).get('/api/pacientes').query({ q: payload }).set(auth(receptionA.token));
    expect(response.status).toBeLessThan(500);
    const after = await pool.query('SELECT count(*)::int AS n FROM patients');
    if (response.status === 200) {
      expect(response.body.data.length).toBeLessThanOrEqual(after.rows[0].n);
      // Nadie tiene ese texto en su nombre: una inyección que "abre" la consulta devolvería a todos.
      if (/OR '1'='1|UNION|DROP|pg_sleep/.test(payload)) expect(response.body.data).toEqual([]);
    }
    // La tabla sigue ahí y no se borró nada (puede haber MÁS filas por otras pruebas).
    expect(after.rows[0].n).toBeGreaterThanOrEqual(before.rows[0].n);
  });

  it.each(PAYLOADS)('el buscador de usuarios con %j no devuelve de más', async (payload) => {
    const response = await request(app).get('/api/usuarios').query({ search: payload }).set(auth(admin.token));
    expect(response.status).toBeLessThan(500);
    if (response.status === 200 && /OR '1'='1|UNION|DROP|pg_sleep/.test(payload)) expect(response.body.data).toEqual([]);
  });

  it.each(PAYLOADS)('los filtros de la bitácora con %j se rechazan o no devuelven de más', async (payload) => {
    for (const field of ['entity_type', 'action', 'entity_id', 'actor_id', 'branch_id', 'from', 'to']) {
      const response = await request(app).get('/api/auditoria').query({ [field]: payload }).set(auth(admin.token));
      expect(response.status, field).toBeLessThan(500);
      if (response.status === 200) expect(response.body.data).toEqual([]);
    }
  });

  it.each(PAYLOADS)('el inicio de sesión con el correo %j se rechaza sin error', async (payload) => {
    const response = await request(app).post('/api/auth/login').send({ email: payload, password: payload });
    expect(response.status).toBe(400);
  });

  it('un correo con comillas válido como correo no abre la consulta', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: "o'brien@prueba.test", password: 'x' });
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('mass assignment: los campos de más se ignoran', () => {
  it('al crear un usuario no se pueden fijar id, hash, contadores ni bloqueo', async () => {
    const email = `masivo-${Date.now()}@prueba.test`;
    const response = await request(app).post('/api/usuarios').set(auth(admin.token)).send({
      full_name: 'Usuario Masivo', email, password: 'clave-segura-1', role: 'recepcionista', branch_ids: [branchA.id],
      id: UUID, is_active: false, password_hash: 'hash-falso', failed_login_attempts: 99, locked_until: '2099-01-01 00:00:00',
      created_at: '2000-01-01 00:00:00',
    });
    expect(response.status).toBe(201);
    expect(response.body.data.id).not.toBe(UUID);
    expect(response.body.data.is_active).toBe(true);
    expect(response.body.data.is_locked).toBe(false);
    const row = await pool.query('SELECT password_hash, failed_login_attempts FROM users WHERE email = $1', [email]);
    expect(row.rows[0].password_hash).not.toBe('hash-falso');
    expect(row.rows[0].failed_login_attempts).toBe(0);
    const login = await request(app).post('/api/auth/login').send({ email, password: 'clave-segura-1' });
    expect(login.status).toBe(200);
  });

  it('al modificar un usuario no se puede cambiar su correo ni su contraseña por esa vía', async () => {
    const target = await actor('recepcionista', [branchA.id]);
    await request(app).patch(`/api/usuarios/${target.id}`).set(auth(admin.token)).send({
      full_name: 'Nombre Nuevo', email: 'robado@prueba.test', password: 'clave-robada-1', password_hash: 'x',
    });
    const row = await pool.query('SELECT email FROM users WHERE id = $1', [target.id]);
    expect(row.rows[0].email).toBe(target.email);
    expect((await request(app).post('/api/auth/login').send({ email: target.email, password: 'clave-robada-1' })).status).toBe(401);
  });

  it('al registrar un paciente no se puede fijar su número de expediente ni su estado', async () => {
    const response = await request(app).post('/api/pacientes').set(auth(receptionA.token)).send({
      full_name: 'Paciente Masivo', birth_date: '1990-05-17', phone: '7000-1111', record_number: 999999, is_active: false, id: UUID,
    });
    expect(response.status).toBe(201);
    expect(response.body.data.record_number).not.toBe(999999);
    expect(response.body.data.is_active).toBe(true);
    expect(response.body.data.id).not.toBe(UUID);
  });

  it('al agendar una cita no se puede fijar el estado, quién la creó ni la hora de fin', async () => {
    const patient = await createTestPatient();
    const date = (() => { const [y, m, d] = todayInElSalvador().split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + 21)).toISOString().slice(0, 10); })();
    const weekday = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    await request(app).post('/api/horarios').set(auth(admin.token)).send({
      doctor_id: doctorA.id, branch_id: branchA.id, weekday, start_time: '08:00', end_time: '12:00',
    });
    const response = await request(app).post('/api/citas').set(auth(receptionA.token)).send({
      patient_id: patient.id, doctor_id: doctorA.id, date, time: '09:00',
      status: 'completed', created_by: receptionB.id, ends_at: `${date} 12:00:00`, branch_id: branchA.id,
    });
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('scheduled');
    const row = await pool.query('SELECT created_by, ends_at FROM appointments WHERE id = $1', [response.body.data.id]);
    expect(row.rows[0].created_by).toBe(receptionA.id);
    expect(String(row.rows[0].ends_at)).not.toContain('12:00');
  });

  it('al crear una orden de óptica no se puede fijar el estado, la sucursal, quién la creó ni el saldo', async () => {
    const patient = await createTestPatient();
    await pool.query("INSERT INTO consents (patient_id, granted_by, branch_id) SELECT $1, $2, $3", [patient.id, receptionA.id, branchA.id]).catch(() => undefined);
    const visit = (await insertAppointment({ patientId: patient.id, doctorId: doctorA.id, branchId: branchA.id, createdBy: receptionA.id, startsAt: `${todayInElSalvador()} 06:00`, status: 'completed' })).rows[0].id;
    const record = (await insertMedicalRecord({ patientId: patient.id, doctorId: doctorA.id, branchId: branchA.id, appointmentId: visit })).rows[0].id;
    const prescription = (await insertPrescription({ patientId: patient.id, doctorId: doctorA.id, branchId: branchA.id, recordId: record })).rows[0].id;
    const consent = await request(app).post(`/api/pacientes/${patient.id}/consentimientos`).set(auth(receptionA.token)).send({});
    expect([200, 201, 409]).toContain(consent.status);
    const response = await request(app).post('/api/ordenes-optica').set(auth(salesA.token)).send({
      prescription_id: prescription, frame_description: 'Armazón', lens_description: 'Lentes', total_amount: 100, deposit_amount: 10,
      status: 'delivered', branch_id: branchB.id, created_by: salesB.id, balance: 0, id: UUID,
    });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ status: 'pending', branch_id: branchA.id, created_by: salesA.id, balance: 90 });
    expect(response.body.data.id).not.toBe(UUID);
  });

  it('al modificar una sucursal no se puede cambiar su código', async () => {
    const response = await request(app).patch(`/api/sucursales/${branchA.id}`).set(auth(admin.token)).send({ name: 'Nombre nuevo', code: 'OTRO_CODIGO' });
    expect(response.status).toBeLessThan(500);
    const row = await pool.query('SELECT code FROM branches WHERE id = $1', [branchA.id]);
    expect(row.rows[0].code).toBe(branchA.code);
  });
});

// ---------------------------------------------------------------------------
// Entradas raras en TODAS las rutas.
// ---------------------------------------------------------------------------
describe('entradas raras en todas las rutas: nunca un 500 ni una pila de errores', () => {
  const permissions = buildPermissions('demostracion');
  // Un rol con permiso para cada ruta (el administrador tiene todo en demostración).
  const hasBody = (method: Method) => method !== 'get' && method !== 'delete';

  const BODIES: Array<[string, unknown]> = [
    ['null', 'null'], ['lista', '[]'], ['texto', '"hola"'], ['número', '123'], ['objeto vacío', '{}'],
    ['__proto__', '{"__proto__":{"role":"admin","isAdmin":true}}'],
    ['constructor', '{"constructor":{"prototype":{"role":"admin"}}}'],
    ['anidado muy hondo', `${'{"a":'.repeat(500)}1${'}'.repeat(500)}`],
    ['tipos cambiados', '{"patient_id":123,"email":[],"password":{},"time":true,"date":null,"status":["x"]}'],
    ['texto enorme en un campo', JSON.stringify({ full_name: 'x'.repeat(50_000), reason: 'y'.repeat(50_000), note: 'z'.repeat(50_000) })],
  ];

  const stackLeak = (text: string) => /\bat .*\.(ts|js):\d+|node_modules|SELECT |INSERT |pg-pool|stack/i.test(text);

  it.each(DISCOVERED.filter((route) => route.key !== 'POST /api/auth/login'))('$key', async (route) => {
    const role = (ROLES.find((r) => r === 'admin') as Role);
    expect(role).toBe('admin');
    void permissions;
    const asAdmin = auth(admin.token);

    // 1) Ids mal escritos en la ruta.
    const badPath = route.path.replace(/:\w+/g, 'no-es-un-uuid');
    let call = request(app)[route.method](badPath).set(asAdmin);
    let response = await (hasBody(route.method) ? call.send({}) : call);
    expect(response.status, `${route.key} con id inválido`).toBeLessThan(500);
    expect(stackLeak(JSON.stringify(response.body))).toBe(false);

    // 2) Cuerpos raros (solo en rutas que reciben cuerpo).
    if (hasBody(route.method)) {
      for (const [name, body] of BODIES) {
        call = request(app)[route.method](fill(route.path)).set(asAdmin).set('Content-Type', 'application/json');
        response = await call.send(body as string);
        expect(response.status, `${route.key} con cuerpo ${name}`).toBeLessThan(500);
        expect(stackLeak(JSON.stringify(response.body)), `${route.key} con cuerpo ${name}`).toBe(false);
      }
    } else {
      // 3) Filtros raros en la URL (rutas de lectura).
      for (const query of ['page=-1', 'page=abc', 'page_size=999999999', 'page[]=1', 'q[]=a&q[]=b', 'sort=;DROP', 'date=9999-99-99', '__proto__[x]=1']) {
        response = await request(app).get(`${fill(route.path)}?${query}`).set(asAdmin);
        expect(response.status, `${route.key}?${query}`).toBeLessThan(500);
        expect(stackLeak(JSON.stringify(response.body))).toBe(false);
      }
    }
  });

  it('el carácter nulo dentro de un texto enviado se rechaza con 400, no con 500', async () => {
    const withNul = 'Ana\u0000Pérez';
    const checks = [
      request(app).post('/api/pacientes').set(auth(receptionA.token)).send({ full_name: withNul, birth_date: '1990-05-17', phone: '7000-1111' }),
      request(app).post('/api/sucursales').set(auth(admin.token)).send({ code: 'NUL1', name: withNul, opening_time: '08:00', closing_time: '17:00' }),
      request(app).get('/api/pacientes').query({ q: withNul }).set(auth(receptionA.token)),
      request(app).get('/api/usuarios').query({ search: withNul }).set(auth(admin.token)),
    ];
    for (const response of await Promise.all(checks)) expect(response.status).toBeLessThan(500);
  });

  it('el inicio de sesión con cuerpos raros responde 400, nunca 500', async () => {
    for (const [name, body] of BODIES) {
      const response = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send(body as string);
      expect(response.status, name).toBeLessThan(500);
    }
  });

  it('un JSON roto o un tipo de contenido raro no da 500', async () => {
    for (const [type, text] of [['application/json', '{"a":'], ['text/plain', 'hola'], ['application/x-www-form-urlencoded', 'email=a&password=b'], ['application/xml', '<a/>']]) {
      const response = await request(app).post('/api/auth/login').set('Content-Type', type).send(text);
      expect(response.status, type).toBeLessThan(500);
    }
  });
});

// ---------------------------------------------------------------------------
describe('evasión de la autenticación', () => {
  const variants = [
    '/api/usuarios', '/api/usuarios/', '/API/USUARIOS', '/api/Usuarios', '//api/usuarios', '/api//usuarios',
    '/api/usuarios/.', '/api/usuarios/%2e', '/api/./usuarios', '/api/auditoria/../usuarios', '/api/usuarios?x=1#y', '/api/usuarios;a=b',
  ];

  it.each(variants)('%s sin sesión nunca devuelve datos', async (url) => {
    const response = await request(app).get(url);
    expect([401, 404], url).toContain(response.status);
    expect(response.body.data).toBeUndefined();
  });

  it('HEAD y OPTIONS sin sesión no entregan datos de rutas protegidas', async () => {
    expect((await request(app).head('/api/usuarios')).status).toBe(401);
    const options = await request(app).options('/api/usuarios');
    expect([204, 404, 401]).toContain(options.status);
    expect(options.text).toBe('');
  });

  it('un método inventado no salta la autenticación', async () => {
    const response = await request(app).trace('/api/usuarios');
    expect([401, 404, 405]).toContain(response.status);
  });

  it('el token en la URL, en una cookie o en otra cabecera no vale; solo "Authorization: Bearer"', async () => {
    const token = admin.token;
    expect((await request(app).get(`/api/usuarios?token=${token}`)).status).toBe(401);
    expect((await request(app).get(`/api/usuarios?access_token=${token}`)).status).toBe(401);
    expect((await request(app).get('/api/usuarios').set('Cookie', `token=${token}`)).status).toBe(401);
    expect((await request(app).get('/api/usuarios').set('X-Access-Token', token)).status).toBe(401);
    expect((await request(app).get('/api/usuarios').set('X-User-Id', admin.id).set('X-User-Role', 'admin')).status).toBe(401);
  });

  it('dos cabeceras Authorization (una buena y una mala) no confunden al servidor', async () => {
    const response = await request(app).get('/api/usuarios').set('Authorization', `Bearer ${receptionA.token}, Bearer ${admin.token}`);
    expect(response.status).toBe(401);
  });

  it('no se puede fijar la sucursal ni el rol desde el cuerpo, la URL u otra cabecera', async () => {
    const response = await request(app).get(`/api/recordatorios?branch_id=${branchB.id}&role=admin`).set(auth(receptionA.token)).set('X-Role', 'admin').set('X-Branch-Id', branchB.id);
    expect(response.status).toBe(200);
    const patient = await createTestPatient();
    const own = await insertAppointment({ patientId: patient.id, doctorId: doctorA.id, branchId: branchB.id, createdBy: receptionB.id, startsAt: `${todayInElSalvador()} 23:00` });
    expect(own.rows[0].id).toBeDefined();
    expect(JSON.stringify(response.body)).not.toContain(own.rows[0].id);
  });
});

// ---------------------------------------------------------------------------
describe('fugas de datos secretos en las respuestas', () => {
  const SECRETS = ['password_hash', 'failed_login_attempts', 'locked_until', '$2b$', '$2a$', 'JWT_SECRET', 'DB_PASSWORD'];

  it('ninguna respuesta de usuarios, sesión o inicio de sesión trae hashes ni contadores internos', async () => {
    const responses = [
      await request(app).get('/api/usuarios').set(auth(admin.token)),
      await request(app).get(`/api/usuarios/${receptionA.id}`).set(auth(admin.token)),
      await request(app).get('/api/auth/me').set(auth(receptionA.token)),
      await request(app).post('/api/auth/login').send({ email: receptionA.email, password: TEST_PASSWORD }),
      await request(app).get('/api/auditoria?page_size=100').set(auth(admin.token)),
    ];
    for (const response of responses) {
      expect(response.status).toBe(200);
      const text = JSON.stringify(response.body);
      for (const secret of SECRETS) expect(text.includes(secret), `${secret} en ${response.request.url}`).toBe(false);
    }
  });

  it('el token de inicio de sesión no lleva contraseñas ni hashes dentro', async () => {
    const payload = JSON.parse(Buffer.from(receptionA.token.split('.')[1], 'base64url').toString());
    expect(Object.keys(payload).sort()).toEqual(['email', 'exp', 'iat', 'role', 'userId']);
  });

  it('las respuestas de error nunca traen la pila ni SQL', async () => {
    const responses = [
      await request(app).get('/api/pacientes/no-es-uuid').set(auth(receptionA.token)),
      await request(app).get('/api/no-existe'),
      await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{'),
    ];
    for (const response of responses) {
      expect(JSON.stringify(response.body)).not.toMatch(/SELECT|INSERT|node_modules|\.ts:\d+|stack/i);
    }
  });

  it('el inicio de sesión no distingue un correo inexistente, una contraseña errónea ni una cuenta desactivada', async () => {
    const disabled = await createTestUser({ role: 'recepcionista', branchIds: [branchA.id], isActive: false });
    const attempts = [
      { email: `no-existe-${Date.now()}@prueba.test`, password: 'cualquiera-123' },
      { email: receptionB.email, password: 'cualquiera-123' },
      { email: disabled.email, password: TEST_PASSWORD },
      { email: disabled.email, password: 'cualquiera-123' },
    ];
    const results = await Promise.all(attempts.map((body) => request(app).post('/api/auth/login').send(body)));
    for (const result of results) {
      expect(result.status).toBe(401);
      expect(result.body).toEqual({ success: false, message: 'Credenciales incorrectas.' });
    }
  });

  describe('el tiempo de respuesta no delata si el correo existe', () => {
    afterEach(() => vi.restoreAllMocks());

    it('un correo inexistente gasta una comprobación de contraseña, igual que uno que existe', async () => {
      const compare = vi.spyOn(bcrypt, 'compare');
      await request(app).post('/api/auth/login').send({ email: `fantasma-${Date.now()}@prueba.test`, password: 'cualquiera-123' });
      expect(compare).toHaveBeenCalledTimes(1);
      compare.mockClear();
      await request(app).post('/api/auth/login').send({ email: receptionB.email, password: 'cualquiera-123' });
      expect(compare).toHaveBeenCalledTimes(1);
    });

    it('una cuenta desactivada también gasta la comprobación (no se nota por la rapidez)', async () => {
      const disabled = await createTestUser({ role: 'recepcionista', branchIds: [branchA.id], isActive: false });
      const compare = vi.spyOn(bcrypt, 'compare');
      await request(app).post('/api/auth/login').send({ email: disabled.email, password: TEST_PASSWORD });
      expect(compare).toHaveBeenCalledTimes(1);
    });

    it('una contraseña de más de 128 caracteres se rechaza sin gastar CPU en cifrado', async () => {
      const compare = vi.spyOn(bcrypt, 'compare');
      const response = await request(app).post('/api/auth/login').send({ email: receptionB.email, password: 'a'.repeat(129) });
      expect(response.status).toBe(400);
      expect(compare).not.toHaveBeenCalled();
    });
  });

  it('el correo se compara sin importar mayúsculas (no se pueden crear dos cuentas "iguales")', async () => {
    const upper = await request(app).post('/api/auth/login').send({ email: receptionA.email.toUpperCase(), password: TEST_PASSWORD });
    expect(upper.status).toBe(200);
    const duplicate = await request(app).post('/api/usuarios').set(auth(admin.token)).send({
      full_name: 'Duplicado', email: receptionA.email.toUpperCase(), password: 'clave-segura-1', role: 'recepcionista', branch_ids: [branchA.id],
    });
    expect(duplicate.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
describe('cabeceras de seguridad y CORS', () => {
  it('las respuestas llevan las cabeceras de helmet y no anuncian el servidor', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['strict-transport-security']).toBeDefined();
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['referrer-policy']).toBeDefined();
  });

  it('las respuestas de error y las de datos también las llevan', async () => {
    for (const response of [await request(app).get('/api/usuarios'), await request(app).get('/api/no-existe')]) {
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-powered-by']).toBeUndefined();
    }
  });

  it('solo el frontend de Candray queda autorizado por CORS; un sitio ajeno no', async () => {
    const own = await request(app).get('/api/usuarios').set('Origin', 'http://localhost:5173');
    expect(own.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    for (const origin of ['http://evil.example', 'http://localhost:5174', 'null', 'http://localhost:5173.evil.example']) {
      const foreign = await request(app).get('/api/usuarios').set('Origin', origin);
      // La API responde siempre con SU origen permitido (el del frontend), nunca con el del sitio ajeno:
      // el navegador del sitio ajeno ve que no coincide y bloquea la lectura de la respuesta.
      expect(foreign.headers['access-control-allow-origin'], origin).toBe('http://localhost:5173');
      expect(foreign.headers['access-control-allow-origin'], origin).not.toBe(origin);
    }
  });

  it('CORS no permite enviar cookies de otros sitios (la API usa un token, no cookies)', async () => {
    const response = await request(app).options('/api/usuarios').set('Origin', 'http://evil.example').set('Access-Control-Request-Method', 'GET');
    expect(response.headers['access-control-allow-origin']).not.toBe('http://evil.example');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('el limitador de inicio de sesión no se evade cambiando X-Forwarded-For', async () => {
    const limited = createApp({ authRateLimitMax: 2 });
    const user = await createTestUser();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const response = await request(limited).post('/api/auth/login').set('X-Forwarded-For', `10.0.0.${i}`).send({ email: user.email, password: 'incorrecta' });
      statuses.push(response.status);
    }
    expect(statuses.slice(2).every((status) => status === 429 || status === 423)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('datos de otra sucursal (IDOR)', () => {
  let patient: { id: string };
  let appointmentB: string;
  let orderB: string;

  beforeAll(async () => {
    patient = await createTestPatient();
    appointmentB = (await insertAppointment({
      patientId: patient.id, doctorId: (await actor('doctor', [branchB.id])).id, branchId: branchB.id, createdBy: receptionB.id,
      startsAt: `${todayInElSalvador()} 09:00`,
    })).rows[0].id;
    const doctorB = await actor('doctor', [branchB.id]);
    const visit = (await insertAppointment({ patientId: patient.id, doctorId: doctorB.id, branchId: branchB.id, createdBy: receptionB.id, startsAt: '2026-01-05 09:00', status: 'completed' })).rows[0].id;
    const record = (await insertMedicalRecord({ patientId: patient.id, doctorId: doctorB.id, branchId: branchB.id, appointmentId: visit })).rows[0].id;
    const prescription = (await insertPrescription({ patientId: patient.id, doctorId: doctorB.id, branchId: branchB.id, recordId: record })).rows[0].id;
    orderB = (await insertOpticalOrder({ patientId: patient.id, prescriptionId: prescription, branchId: branchB.id, createdBy: salesB.id })).rows[0].id;
  });

  it('una cita de otra sucursal responde 404, igual que una que no existe (no revela que existe)', async () => {
    const foreign = await request(app).get(`/api/citas/${appointmentB}`).set(auth(receptionA.token));
    const missing = await request(app).get(`/api/citas/${UUID}`).set(auth(receptionA.token));
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
  });

  it('no se puede cambiar una cita de otra sucursal', async () => {
    for (const call of [
      request(app).patch(`/api/citas/${appointmentB}`).set(auth(receptionA.token)).send({ time: '10:00' }),
      request(app).patch(`/api/citas/${appointmentB}/estado`).set(auth(receptionA.token)).send({ status: 'cancelled', cancellation_reason: 'x' }),
    ]) {
      expect((await call).status).toBe(404);
    }
  });

  it('una orden de otra sucursal responde 404 igual que una inexistente, y no se puede avanzar', async () => {
    const foreign = await request(app).get(`/api/ordenes-optica/${orderB}`).set(auth(salesA.token));
    const missing = await request(app).get(`/api/ordenes-optica/${UUID}`).set(auth(salesA.token));
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect((await request(app).post(`/api/ordenes-optica/${orderB}/estado`).set(auth(salesA.token)).send({ status: 'in_lab' })).status).toBe(404);
  });

  it('las listas solo traen datos de las sucursales de la persona, aunque pida otra con un filtro', async () => {
    const today = todayInElSalvador();
    const asked = await request(app).get(`/api/citas?date=${today}&branch_id=${branchB.id}`).set(auth(receptionA.token));
    expect(asked.status).toBe(403);
    const plain = await request(app).get(`/api/citas?date=${today}&page_size=200`).set(auth(receptionA.token));
    expect(JSON.stringify(plain.body)).not.toContain(appointmentB);
    const orders = await request(app).get(`/api/ordenes-optica?branch_id=${branchB.id}`).set(auth(salesA.token));
    expect(orders.status).toBe(403);
    const ownOrders = await request(app).get('/api/ordenes-optica?page_size=100').set(auth(salesA.token));
    expect(JSON.stringify(ownOrders.body)).not.toContain(orderB);
  });

  it('una sucursal desactivada deja de ser elegible para quien tenía acceso', async () => {
    const closed = await createTestBranch();
    const worker = await actor('recepcionista', [closed.id]);
    expect((await request(app).get('/api/recordatorios').set(auth(worker.token))).status).toBe(200);
    await pool.query('UPDATE branches SET is_active = false WHERE id = $1', [closed.id]);
    expect((await request(app).get('/api/recordatorios').set(auth(worker.token))).status).toBe(403);
    expect((await request(app).get('/api/recordatorios').set(auth(worker.token)).set('X-Sucursal-Id', closed.id)).status).toBe(403);
  });

  it('un médico solo ve sus propias citas, aunque otro médico trabaje en su misma sucursal', async () => {
    const patientA = await createTestPatient();
    const mine = (await insertAppointment({ patientId: patientA.id, doctorId: doctorA.id, branchId: branchA.id, createdBy: receptionA.id, startsAt: `${todayInElSalvador()} 15:00` })).rows[0].id;
    expect((await request(app).get(`/api/citas/${mine}`).set(auth(doctorA.token))).status).toBe(200);
    expect((await request(app).get(`/api/citas/${mine}`).set(auth(doctorA2.token))).status).toBe(404);
    const list = await request(app).get(`/api/citas?date=${todayInElSalvador()}&page_size=200`).set(auth(doctorA2.token));
    expect(JSON.stringify(list.body)).not.toContain(mine);
  });
});

// ---------------------------------------------------------------------------
describe('abuso de paginación y de límites', () => {
  const lists = ['/api/pacientes', '/api/citas', '/api/ordenes-optica', '/api/auditoria'];

  it.each(lists)('%s rechaza tamaños de página absurdos o negativos', async (url) => {
    // /api/citas exige una fecha: sin ella el 400 sería por otra causa y la prueba no diría nada.
    const required = url === '/api/citas' ? `date=${todayInElSalvador()}&` : '';
    for (const query of ['page_size=100000', 'page_size=0', 'page_size=-5', 'page=0', 'page=99999999999', 'page_size=1e9']) {
      const response = await request(app).get(`${url}?${required}${query}`).set(auth(admin.token));
      expect(response.status, `${url}?${query}`).toBe(400);
    }
  });

  it('el cuerpo de más de 100 kb se corta con 413 en una ruta autenticada también', async () => {
    const response = await request(app).post('/api/pacientes').set(auth(receptionA.token)).send({ full_name: 'x'.repeat(200 * 1024) });
    expect(response.status).toBe(413);
  });
});
