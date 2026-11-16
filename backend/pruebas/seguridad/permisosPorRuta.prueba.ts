// =============================================================================
// permisosPorRuta.prueba.ts
// Qué prueba:   la revisión de seguridad del control de acceso. Para CADA ruta
//               de la API, con CADA rol y con los DOS perfiles de permisos:
//                 - quien no tiene la capacidad recibe 403 (nunca datos);
//                 - quien la tiene no recibe 403 por permisos ni 401, y la API
//                   nunca responde 500 aunque el cuerpo venga vacío;
//                 - sin sesión, con un token falso, vencido o de otro usuario,
//                   toda ruta protegida responde 401.
//               También que las rutas con sucursal rechazan una sucursal ajena.
// Cómo:         las rutas se DESCUBREN recorriendo los routers reales de
//               Express; la tabla de abajo es la especificación escrita aparte.
//               Si alguien agrega una ruta y no la anota aquí, la prueba falla.
// Depende de:   app.ts, rutas/*.ts, configuracion/permisos.ts y las ayudas.
//
// Por qué se vuelve a cargar la aplicación por perfil: can() lee el perfil una
// sola vez al cargarse, así que para probar "estricto" hay que cargarla de nuevo
// con la variable PERFIL_PERMISOS cambiada.
// =============================================================================
import { readFileSync } from 'fs';
import jwt from 'jsonwebtoken';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import { pool } from '../../src/configuracion/baseDatos';
import {
  buildPermissions, PERMISSION_PROFILES, type Capability, type PermissionProfile,
} from '../../src/configuracion/permisos';
import { ROLES, type Role } from '../../src/configuracion/roles';
import { signToken } from '../../src/utilidades/token';
import { createTestBranch, createTestUser, type TestBranch } from '../ayudas/datosPrueba';
import { DISCOVERED, MOUNTS, P, UUID, fill, type Method } from '../ayudas/rutasApi';

// ---------------------------------------------------------------------------
// La especificación: cada ruta, la o las capacidades que exige (todas juntas) y
// si usa la sucursal activa. "public" = sin sesión; "session" = cualquier sesión.
// ---------------------------------------------------------------------------
interface Spec {
  needs: readonly Capability[] | 'public' | 'session';
  scoped: boolean; // true = lee la sucursal activa (cabecera X-Sucursal-Id)
}

const SPECS: Record<string, Spec> = {
  'POST /api/auth/login': { needs: 'public', scoped: false },
  'GET /api/auth/me': { needs: 'session', scoped: true },

  'GET /api/usuarios': { needs: ['users_manage'], scoped: false },
  'POST /api/usuarios': { needs: ['users_manage'], scoped: false },
  'GET /api/usuarios/:id': { needs: ['users_manage'], scoped: false },
  'PATCH /api/usuarios/:id': { needs: ['users_manage'], scoped: false },
  'PUT /api/usuarios/:id/sucursales': { needs: ['users_manage'], scoped: false },
  'POST /api/usuarios/:id/desbloquear': { needs: ['users_manage'], scoped: false },
  'PUT /api/usuarios/:id/contrasena': { needs: ['users_manage'], scoped: false },

  'GET /api/sucursales': { needs: ['branches_manage'], scoped: false },
  'POST /api/sucursales': { needs: ['branches_manage'], scoped: false },
  'GET /api/sucursales/:id': { needs: ['branches_manage'], scoped: false },
  'PATCH /api/sucursales/:id': { needs: ['branches_manage'], scoped: false },

  [`GET ${P}/:patientId/expediente`]: { needs: ['medical_records_read'], scoped: true },
  [`GET ${P}/:patientId/expediente/pendientes`]: { needs: ['medical_records_author'], scoped: true },
  [`GET ${P}/:patientId/expediente/impresion`]: { needs: ['medical_records_output'], scoped: true },
  [`POST ${P}/:patientId/expediente`]: { needs: ['medical_records_author'], scoped: true },
  [`POST ${P}/:patientId/expediente/:recordId/enmiendas`]: { needs: ['medical_records_author'], scoped: true },

  [`GET ${P}/:patientId/interconsultas`]: { needs: ['referrals_manage'], scoped: true },
  [`GET ${P}/:patientId/interconsultas/candidatos`]: { needs: ['referrals_manage'], scoped: true },
  [`POST ${P}/:patientId/interconsultas`]: { needs: ['referrals_manage'], scoped: true },
  [`POST ${P}/:patientId/interconsultas/:referralId/revocar`]: { needs: ['referrals_manage'], scoped: true },

  [`GET ${P}/:patientId/consentimientos`]: { needs: ['consents_manage'], scoped: true },
  [`GET ${P}/:patientId/consentimientos/estado`]: { needs: ['consents_read'], scoped: true },
  [`POST ${P}/:patientId/consentimientos`]: { needs: ['consents_manage'], scoped: true },
  [`POST ${P}/:patientId/consentimientos/:consentId/revocar`]: { needs: ['consents_manage'], scoped: true },

  [`GET ${P}/:patientId/recetas`]: { needs: ['prescriptions_read'], scoped: true },
  [`POST ${P}/:patientId/recetas`]: { needs: ['prescriptions_author'], scoped: true },
  [`POST ${P}/:patientId/recetas/:prescriptionId/reemplazos`]: { needs: ['prescriptions_author'], scoped: true },

  [`GET ${P}`]: { needs: ['patients_search'], scoped: false },
  [`GET ${P}/:id`]: { needs: ['patients_search'], scoped: false },
  [`POST ${P}`]: { needs: ['patients_search', 'patients_manage'], scoped: true },
  [`PATCH ${P}/:id`]: { needs: ['patients_search', 'patients_manage'], scoped: true },

  'GET /api/horarios': { needs: ['availability_read'], scoped: true },
  'GET /api/horarios/:id': { needs: ['availability_read'], scoped: true },
  'POST /api/horarios': { needs: ['availability_read', 'schedules_manage'], scoped: false },
  'PATCH /api/horarios/:id': { needs: ['availability_read', 'schedules_manage'], scoped: false },
  'DELETE /api/horarios/:id': { needs: ['availability_read', 'schedules_manage'], scoped: false },

  'GET /api/disponibilidad': { needs: ['availability_read'], scoped: true },

  'GET /api/citas': { needs: ['appointments_read'], scoped: true },
  'GET /api/citas/:id': { needs: ['appointments_read'], scoped: true },
  'POST /api/citas': { needs: ['appointments_read', 'appointments_manage'], scoped: true },
  'PATCH /api/citas/:id': { needs: ['appointments_read', 'appointments_manage'], scoped: true },
  'PATCH /api/citas/:id/estado': { needs: ['appointments_read', 'appointments_manage'], scoped: true },

  'GET /api/ordenes-optica': { needs: ['optical_orders_read'], scoped: true },
  'GET /api/ordenes-optica/:orderId': { needs: ['optical_orders_read'], scoped: true },
  'POST /api/ordenes-optica': { needs: ['optical_orders_manage'], scoped: true },
  'POST /api/ordenes-optica/:orderId/estado': { needs: ['optical_orders_manage'], scoped: true },

  'GET /api/panel': { needs: ['dashboard_read'], scoped: true },
  'GET /api/recordatorios': { needs: ['reminders_read'], scoped: true },

  'GET /api/auditoria': { needs: ['audit_read'], scoped: false },
  'GET /api/auditoria/filtros': { needs: ['audit_read'], scoped: false },
};

const DENIED_MESSAGE = 'No tiene permisos para realizar esta acción.';
const hasBody = (method: Method) => method !== 'get' && method !== 'delete';

function send(app: Express, method: Method, route: string, token?: string, headers: Record<string, string> = {}) {
  let call = request(app)[method](fill(route));
  if (token) call = call.set('Authorization', `Bearer ${token}`);
  for (const [name, value] of Object.entries(headers)) call = call.set(name, value);
  return hasBody(method) ? call.send({}) : call;
}

// ---------------------------------------------------------------------------
// Usuarios de prueba: uno por rol, en una sucursal.
// ---------------------------------------------------------------------------
let branchA: TestBranch;
const users = {} as Record<Role, { id: string; email: string; token: string }>;

beforeAll(async () => {
  branchA = await createTestBranch();
  for (const role of ROLES) {
    const user = await createTestUser({ role, branchIds: [branchA.id] });
    users[role] = { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
  }
});

// ---------------------------------------------------------------------------
// La tabla y las rutas reales deben coincidir.
// ---------------------------------------------------------------------------
describe('la especificación cubre todas las rutas', () => {
  it('toda ruta de la API está anotada en la tabla (una ruta nueva sin anotar falla aquí)', () => {
    const missing = DISCOVERED.map((route) => route.key).filter((key) => !(key in SPECS));
    expect(missing).toEqual([]);
  });

  it('toda anotación de la tabla corresponde a una ruta que existe (sin entradas viejas)', () => {
    const real = new Set(DISCOVERED.map((route) => route.key));
    expect(Object.keys(SPECS).filter((key) => !real.has(key))).toEqual([]);
  });

  it('app.ts monta exactamente los archivos de rutas de esta prueba', () => {
    const source = readFileSync(path.join(__dirname, '../../src/app.ts'), 'utf8');
    const mounted = [...source.matchAll(/app\.use\('(\/api\/[^']+)',\s*\w+\)/g)].map((match) => match[1]);
    // "/api" a secas es el limitador general (lleva otra forma, no un router).
    expect(mounted.sort()).toEqual(MOUNTS.map((mount) => mount.prefix).sort());
  });

  it('hay al menos 50 rutas (si baja, el descubrimiento dejó de funcionar)', () => {
    expect(DISCOVERED.length).toBeGreaterThanOrEqual(50);
  });
});

// ---------------------------------------------------------------------------
// Rol × ruta × perfil.
// ---------------------------------------------------------------------------
describe.each(PERMISSION_PROFILES)('perfil de permisos "%s"', (profile: PermissionProfile) => {
  let app: Express;
  let closeApp: () => Promise<void>;
  const permissions = buildPermissions(profile);
  const roleHas = (role: Role, spec: Spec) =>
    spec.needs === 'public' || spec.needs === 'session' || spec.needs.every((capability) => permissions[capability].includes(role));

  beforeAll(async () => {
    // can() lee el perfil al cargarse: se carga la aplicación de nuevo con el perfil elegido.
    vi.resetModules();
    process.env.PERFIL_PERMISOS = profile;
    const loaded = await import('../../src/app');
    app = loaded.createApp();
    const database = await import('../../src/configuracion/baseDatos');
    closeApp = database.closeDatabase;
  });

  afterAll(async () => {
    process.env.PERFIL_PERMISOS = 'demostracion';
    await closeApp();
  });

  it('el perfil cargado es el que se quiere probar (un 403 de "estricto" solo ocurre si de verdad cargó)', async () => {
    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${users.admin.token}`);
    expect(response.status).toBe(200);
    const expected = buildPermissions(profile);
    const received = response.body.data.capabilities as Capability[];
    expect(received.sort()).toEqual(Object.keys(expected).filter((c) => expected[c as Capability].includes('admin')).sort());
  });

  describe.each(DISCOVERED)('$key', (route) => {
    const spec = SPECS[route.key];

    if (spec.needs !== 'public') {
      it('sin token responde 401', async () => {
        const response = await send(app, route.method, route.path);
        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      });
    }

    it.each(ROLES)('rol %s', async (role) => {
      if (spec.needs === 'public') return; // el inicio de sesión no depende del rol
      const response = await send(app, route.method, route.path, users[role].token);
      if (roleHas(role, spec)) {
        // Con permiso: ni 401, ni el 403 de permisos, ni un fallo del servidor.
        expect(response.status, `${role} ${route.key}: ${JSON.stringify(response.body)}`).not.toBe(401);
        expect(response.status, `${role} ${route.key}`).toBeLessThan(500);
        if (response.status === 403) expect(response.body.message).not.toBe(DENIED_MESSAGE);
      } else {
        // Sin permiso: 403 con el mensaje de permisos y NINGÚN dato.
        expect(response.status, `${role} ${route.key}`).toBe(403);
        expect(response.body).toEqual({ success: false, message: DENIED_MESSAGE });
      }
    });

    if (spec.scoped && spec.needs !== 'public') {
      it('una sucursal ajena en X-Sucursal-Id responde 403 (nadie elige una sucursal sin acceso)', async () => {
        const allowed = ROLES.find((role) => roleHas(role, spec as Spec));
        if (allowed === undefined) return; // ningún rol llega hasta aquí en este perfil
        const stranger = await createTestBranch(); // existe, pero el usuario no está en ella
        const forRole = ROLES.filter((role) => roleHas(role, spec as Spec));
        for (const role of forRole) {
          // Administrador y directivo ven todas las sucursales: se prueba con una que no existe.
          const target = role === 'admin' || role === 'directivo' ? UUID : stranger.id;
          const response = await send(app, route.method, route.path, users[role].token, { 'X-Sucursal-Id': target });
          expect(response.status, `${role} ${route.key}`).toBe(403);
          expect(response.body.message).toBe('No tiene acceso a esa sucursal.');
        }
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Tokens defectuosos: toda ruta protegida los rechaza con 401.
// ---------------------------------------------------------------------------
describe('tokens defectuosos', () => {
  const protectedRoutes = DISCOVERED.filter((route) => SPECS[route.key].needs !== 'public');
  let app: Express;
  let closeApp: () => Promise<void>;

  beforeAll(async () => {
    vi.resetModules();
    process.env.PERFIL_PERMISOS = 'demostracion';
    app = (await import('../../src/app')).createApp();
    closeApp = (await import('../../src/configuracion/baseDatos')).closeDatabase;
  });
  afterAll(async () => closeApp());

  const admin = () => ({ userId: users.admin.id, email: users.admin.email, role: 'admin' as Role });
  const secret = process.env.JWT_SECRET as string;
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

  // Cada caso fabrica un token malo distinto. Todos deben dar 401 en TODAS las rutas.
  const bad: Array<[string, () => string | Promise<string>]> = [
    ['texto cualquiera', () => 'esto-no-es-un-token'],
    ['firmado con otra clave', () => jwt.sign(admin(), 'otra-clave-que-no-es-la-del-servidor-1234567890', { algorithm: 'HS256' })],
    ['vencido', () => jwt.sign(admin(), secret, { algorithm: 'HS256', expiresIn: -60 })],
    ['sin firma (alg none)', () => `${b64({ alg: 'none', typ: 'JWT' })}.${b64(admin())}.`],
    ['con otro algoritmo (HS512)', () => jwt.sign(admin(), secret, { algorithm: 'HS512' })],
    ['de un usuario que no existe', () => jwt.sign({ ...admin(), userId: UUID }, secret, { algorithm: 'HS256' })],
    ['con un rol inventado', () => jwt.sign({ ...admin(), role: 'superusuario' }, secret, { algorithm: 'HS256' })],
    ['sin identificador de usuario', () => jwt.sign({ email: 'a@b.co', role: 'admin' }, secret, { algorithm: 'HS256' })],
    ['de un usuario desactivado', async () => {
      const gone = await createTestUser({ role: 'admin' });
      await pool.query('UPDATE users SET is_active = false WHERE id = $1', [gone.id]);
      return signToken({ userId: gone.id, email: gone.email, role: 'admin' });
    }],
  ];

  it.each(bad)('token %s: 401 en todas las rutas protegidas', async (_name, make) => {
    const token = await make();
    for (const route of protectedRoutes) {
      const response = await send(app, route.method, route.path, token);
      expect(response.status, route.key).toBe(401);
    }
  });

  it.each(['Basic abc', 'bearer minuscula', 'Bearer', 'Token abc'])('cabecera Authorization "%s": 401', async (header) => {
    for (const route of protectedRoutes.slice(0, 10)) {
      const response = await request(app)[route.method](fill(route.path)).set('Authorization', header);
      expect(response.status, route.key).toBe(401);
    }
  });

  it('el rol que vale es el de la base, no el que dice el token: un token con rol "admin" de una recepcionista no abre rutas de administración', async () => {
    const forged = jwt.sign({ userId: users.recepcionista.id, email: users.recepcionista.email, role: 'admin' }, secret, { algorithm: 'HS256' });
    for (const route of ['/api/usuarios', '/api/sucursales', '/api/auditoria']) {
      expect((await request(app).get(route).set('Authorization', `Bearer ${forged}`)).status, route).toBe(403);
    }
  });

  it('cambiar el rol o desactivar a alguien surte efecto de inmediato, sin esperar a que venza su token', async () => {
    const user = await createTestUser({ role: 'admin' });
    const token = signToken({ userId: user.id, email: user.email, role: 'admin' });
    expect((await request(app).get('/api/usuarios').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    await pool.query("UPDATE users SET role = 'directivo' WHERE id = $1", [user.id]);
    expect((await request(app).get('/api/usuarios').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);
    expect((await request(app).get('/api/usuarios').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });

  it('quitarle la sucursal a alguien surte efecto de inmediato', async () => {
    const branch = await createTestBranch();
    const user = await createTestUser({ role: 'recepcionista', branchIds: [branch.id] });
    const token = signToken({ userId: user.id, email: user.email, role: 'recepcionista' });
    expect((await request(app).get('/api/recordatorios').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    await pool.query('DELETE FROM user_branches WHERE user_id = $1', [user.id]);
    expect((await request(app).get('/api/recordatorios').set('Authorization', `Bearer ${token}`)).status).toBe(403);
  });
});
