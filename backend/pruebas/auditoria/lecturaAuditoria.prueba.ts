// =============================================================================
// lecturaAuditoria.prueba.ts
// Qué prueba:   la consulta de la bitácora de auditoría por HTTP: quién puede
//               verla, paginación, orden, cada filtro, validación de
//               parámetros y que la API no permita modificarla.
// Cómo:         siembra entradas con un tipo de entidad único por prueba (así
//               las pruebas no se estorban) y llama a la API real (supertest).
// Depende de:   app.ts, modelos/auditoria.ts y ayudas/datosPrueba.ts.
// =============================================================================
import { randomUUID } from 'crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import { ROLES, type Role } from '../../src/configuracion/roles';
import { createAuditEntry } from '../../src/modelos/auditoria';
import { signToken } from '../../src/utilidades/token';
import { createTestBranch, createTestUser } from '../ayudas/datosPrueba';

const app = createApp();

async function actor(role: Role, branchIds: string[] = []) {
  const user = await createTestUser({ role, branchIds });
  return { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
}

const get = (token: string, url: string) =>
  request(app).get(url).set('Authorization', `Bearer ${token}`);

// Tipo de entidad único para aislar los datos de cada prueba.
const uniqueType = () => `t_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

describe('Permisos de /api/auditoria', () => {
  it('sin token responde 401', async () => {
    expect((await request(app).get('/api/auditoria')).status).toBe(401);
  });

  it.each(['admin', 'directivo'] as Role[])('%s puede consultar', async (role) => {
    const { token } = await actor(role);
    expect((await get(token, '/api/auditoria')).status).toBe(200);
    expect((await get(token, '/api/auditoria/filtros')).status).toBe(200);
  });

  it.each(ROLES.filter((role) => role !== 'admin' && role !== 'directivo'))(
    '%s recibe 403',
    async (role) => {
      const branch = await createTestBranch();
      const { token } = await actor(role, [branch.id]);
      expect((await get(token, '/api/auditoria')).status).toBe(403);
      expect((await get(token, '/api/auditoria/filtros')).status).toBe(403);
    },
  );

  it('la API no ofrece ninguna forma de crear, cambiar o borrar entradas', async () => {
    const { token } = await actor('admin');
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const response = await request(app)[method]('/api/auditoria').set('Authorization', `Bearer ${token}`).send({});
      expect(response.status).toBe(404);
    }
  });
});

describe('Listado, orden y paginación', () => {
  it('devuelve las entradas de la más reciente a la más antigua, con quién y dónde', async () => {
    const admin = await actor('admin');
    const branch = await createTestBranch();
    const type = uniqueType();
    for (let n = 1; n <= 3; n++) {
      await createAuditEntry({ entityType: type, action: 'prueba', actorId: admin.id, branchId: branch.id, detail: { n } });
    }

    const response = await get(admin.token, `/api/auditoria?entity_type=${type}`);
    expect(response.status).toBe(200);
    expect(response.body.data.map((row: { detail: { n: number } }) => row.detail.n)).toEqual([3, 2, 1]);
    expect(response.body.data[0]).toMatchObject({
      actor_id: admin.id, actor_email: admin.email, branch_id: branch.id, branch_name: `Sucursal ${branch.code}`,
    });
  });

  it('una entrada sin usuario ni sucursal sale con esos campos en null', async () => {
    const admin = await actor('admin');
    const type = uniqueType();
    await createAuditEntry({ entityType: type, action: 'anonima' });
    const response = await get(admin.token, `/api/auditoria?entity_type=${type}`);
    expect(response.body.data[0]).toMatchObject({ actor_id: null, actor_name: null, branch_id: null, branch_name: null });
  });

  it('pagina sin repetir ni saltar filas, y calcula el total', async () => {
    const admin = await actor('admin');
    const type = uniqueType();
    for (let n = 1; n <= 5; n++) await createAuditEntry({ entityType: type, action: 'prueba', detail: { n } });

    const pages = [];
    for (const page of [1, 2, 3]) {
      pages.push(await get(admin.token, `/api/auditoria?entity_type=${type}&page_size=2&page=${page}`));
    }
    const numbers = pages.flatMap((r) => r.body.data.map((row: { detail: { n: number } }) => row.detail.n));
    expect(numbers).toEqual([5, 4, 3, 2, 1]);
    expect(pages[0].body.pagination).toEqual({ page: 1, page_size: 2, total: 5, total_pages: 3 });
    expect(pages[2].body.data).toHaveLength(1);

    const beyond = await get(admin.token, `/api/auditoria?entity_type=${type}&page_size=2&page=9`);
    expect(beyond.body.data).toHaveLength(0);
    expect(beyond.body.pagination.total).toBe(5); // el total sigue siendo correcto
  });

  it('el tamaño de página por defecto es 25', async () => {
    const admin = await actor('admin');
    const response = await get(admin.token, '/api/auditoria');
    expect(response.body.pagination.page_size).toBe(25);
    expect(response.body.data.length).toBeLessThanOrEqual(25);
  });
});

describe('Filtros', () => {
  it('filtra por acción, entidad, actor y sucursal (y los combina)', async () => {
    const admin = await actor('admin');
    const other = await actor('directivo');
    const [branchA, branchB] = [await createTestBranch(), await createTestBranch()];
    const type = uniqueType();
    const entityId = randomUUID();
    await createAuditEntry({ entityType: type, action: 'crear', actorId: admin.id, branchId: branchA.id, entityId });
    await createAuditEntry({ entityType: type, action: 'borrar', actorId: other.id, branchId: branchB.id });

    const ids = async (query: string) =>
      (await get(admin.token, `/api/auditoria?entity_type=${type}&${query}`)).body.data.map((r: { action: string }) => r.action);

    expect(await ids('action=crear')).toEqual(['crear']);
    expect(await ids(`actor_id=${other.id}`)).toEqual(['borrar']);
    expect(await ids(`branch_id=${branchA.id}`)).toEqual(['crear']);
    expect(await ids(`entity_id=${entityId}`)).toEqual(['crear']);
    expect(await ids(`action=crear&actor_id=${other.id}`)).toEqual([]); // se combinan con AND
  });

  it('filtra por rango de fechas, inclusive en ambos extremos', async () => {
    const admin = await actor('admin');
    const type = uniqueType();
    // Se insertan filas con fecha explícita (INSERT sí está permitido).
    for (const [day, label] of [['2020-01-14 23:59:59', 'antes'], ['2020-01-15 00:00:00', 'inicio'], ['2020-01-16 23:59:59', 'fin'], ['2020-01-17 00:00:00', 'despues']]) {
      await pool.query(`INSERT INTO audit_log (entity_type, action, created_at) VALUES ($1, $2, $3)`, [type, label, day]);
    }
    const labels = async (query: string) =>
      (await get(admin.token, `/api/auditoria?entity_type=${type}&${query}`)).body.data.map((r: { action: string }) => r.action).sort();

    expect(await labels('from=2020-01-15&to=2020-01-16')).toEqual(['fin', 'inicio']);
    expect(await labels('from=2020-01-16')).toEqual(['despues', 'fin']);
    expect(await labels('to=2020-01-14')).toEqual(['antes']);
  });

  it('un texto con comillas o SQL en un filtro no rompe nada ni inyecta', async () => {
    const admin = await actor('admin');
    const response = await get(admin.token, `/api/auditoria?action=${encodeURIComponent("x' OR '1'='1")}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });

  it.each([
    ['página 0', 'page=0'],
    ['página no numérica', 'page=abc'],
    ['tamaño de página 0', 'page_size=0'],
    ['tamaño de página 101', 'page_size=101'],
    ['fecha mal escrita', 'from=15-01-2020'],
    ['fecha inexistente', 'to=2026-02-31'],
    ['rango invertido', 'from=2026-02-10&to=2026-02-01'],
    ['actor que no es uuid', 'actor_id=abc'],
    ['sucursal que no es uuid', 'branch_id=abc'],
  ])('rechaza (400): %s', async (_name, query) => {
    const admin = await actor('admin');
    expect((await get(admin.token, `/api/auditoria?${query}`)).status).toBe(400);
  });
});

describe('Filtros disponibles', () => {
  it('lista los tipos de entidad y acciones que existen, ordenados', async () => {
    const admin = await actor('admin');
    const type = uniqueType();
    await createAuditEntry({ entityType: type, action: 'accion_unica_xyz' });
    const response = await get(admin.token, '/api/auditoria/filtros');
    expect(response.body.data.entity_types).toContain(type);
    expect(response.body.data.actions).toContain('accion_unica_xyz');
    expect(response.body.data.entity_types).toEqual([...response.body.data.entity_types].sort());
  });
});

describe('Lo que ya audita el sistema es consultable', () => {
  it('el login deja una entrada que aparece en la consulta', async () => {
    const admin = await actor('admin');
    const branch = await createTestBranch();
    const doctor = await createTestUser({ role: 'doctor', branchIds: [branch.id] });
    await request(app).post('/api/auth/login').send({ email: doctor.email, password: 'contrasena-de-prueba' });
    const response = await get(admin.token, `/api/auditoria?actor_id=${doctor.id}&action=login_success`);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].branch_id).toBe(branch.id);
  });
});
