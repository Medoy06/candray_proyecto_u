// =============================================================================
// gestionUsuarios.prueba.ts
// Qué prueba:   la administración de usuarios por HTTP: permisos por rol,
//               creación con sucursales, cambios de rol y estado, reglas de
//               protección, desbloqueo, contraseña nueva y auditoría.
// Cómo:         llama a la API real (supertest) sobre la base candray_test.
// Depende de:   app.ts, ayudas/datosPrueba.ts y servicios/gestionUsuarios.ts.
// =============================================================================
import { randomUUID } from 'crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import { ROLES, type Role } from '../../src/configuracion/roles';
import { assertAdminRemains } from '../../src/servicios/gestionUsuarios';
import { signToken } from '../../src/utilidades/token';
import { createTestBranch, createTestUser, TEST_PASSWORD } from '../ayudas/datosPrueba';

const app = createApp();

// Crea un usuario de prueba con el rol indicado y devuelve sus datos y su token.
async function actor(role: Role, branchIds: string[] = []) {
  const user = await createTestUser({ role, branchIds });
  return { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
}

const api = (token: string) => ({
  get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
  patch: (url: string) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
  put: (url: string) => request(app).put(url).set('Authorization', `Bearer ${token}`),
});

const newEmail = () => `${randomUUID()}@nuevo.test`;

// Entradas de auditoría de una acción sobre una entidad.
async function auditRows(entityId: string, action: string) {
  const result = await pool.query(
    'SELECT actor_id, detail FROM audit_log WHERE entity_id = $1 AND action = $2',
    [entityId, action],
  );
  return result.rows;
}

describe('Permisos de /api/usuarios', () => {
  it('sin token responde 401', async () => {
    expect((await request(app).get('/api/usuarios')).status).toBe(401);
  });

  it.each(ROLES.filter((role) => role !== 'admin'))('%s recibe 403 en todas las rutas', async (role) => {
    const { token } = await actor(role, role === 'directivo' ? [] : [(await createTestBranch()).id]);
    const call = api(token);
    const id = randomUUID();
    const responses = await Promise.all([
      call.get('/api/usuarios'),
      call.post('/api/usuarios').send({}),
      call.get(`/api/usuarios/${id}`),
      call.patch(`/api/usuarios/${id}`).send({ full_name: 'X Y' }),
      call.put(`/api/usuarios/${id}/sucursales`).send({ branch_ids: [] }),
      call.post(`/api/usuarios/${id}/desbloquear`),
      call.put(`/api/usuarios/${id}/contrasena`).send({ password: 'otra-clave-123' }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403, 403, 403, 403]);
  });
});

describe('Crear usuario', () => {
  it('crea un médico con sucursales, sin devolver datos secretos, y puede iniciar sesión', async () => {
    const admin = await actor('admin');
    const [a, b] = [await createTestBranch(), await createTestBranch()];
    const email = newEmail().toUpperCase();

    const response = await api(admin.token).post('/api/usuarios').send({
      full_name: 'Dra. Nueva Prueba',
      email,
      password: 'clave-segura-1',
      role: 'doctor',
      branch_ids: [a.id, b.id],
      default_branch_id: b.id,
    });

    expect(response.status).toBe(201);
    const user = response.body.data;
    expect(user.email).toBe(email.toLowerCase());
    expect(user).not.toHaveProperty('password_hash');
    expect(JSON.stringify(response.body)).not.toContain('clave-segura-1');
    expect(user.branches.map((x: { id: string }) => x.id)[0]).toBe(b.id); // predeterminada primero
    expect(user.branches).toHaveLength(2);

    const login = await request(app).post('/api/auth/login').send({ email, password: 'clave-segura-1' });
    expect(login.status).toBe(200);
    expect(login.body.data.activeBranchId).toBe(b.id);
  });

  it('sin predeterminada indicada, la primera sucursal lo es', async () => {
    const admin = await actor('admin');
    const [a, b] = [await createTestBranch(), await createTestBranch()];
    const response = await api(admin.token).post('/api/usuarios').send({
      full_name: 'Sin Default', email: newEmail(), password: 'clave-segura-1', role: 'recepcionista',
      branch_ids: [a.id, b.id],
    });
    expect(response.body.data.branches[0].id).toBe(a.id);
    expect(response.body.data.branches[0].is_default).toBe(true);
  });

  it('un administrador o directivo se puede crear sin sucursales', async () => {
    const admin = await actor('admin');
    for (const role of ['admin', 'directivo']) {
      const response = await api(admin.token).post('/api/usuarios').send({
        full_name: 'Sin Sucursal', email: newEmail(), password: 'clave-segura-1', role,
      });
      expect(response.status).toBe(201);
    }
  });

  it('un rol de sucursal sin sucursales se rechaza (400)', async () => {
    const admin = await actor('admin');
    const response = await api(admin.token).post('/api/usuarios').send({
      full_name: 'Sin Sucursal', email: newEmail(), password: 'clave-segura-1', role: 'doctor',
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('sucursal');
  });

  it('un correo repetido (aunque cambien las mayúsculas) da 409 con mensaje claro', async () => {
    const admin = await actor('admin');
    const branch = await createTestBranch();
    const email = newEmail();
    const body = { full_name: 'Repetido', password: 'clave-segura-1', role: 'recepcionista', branch_ids: [branch.id] };
    expect((await api(admin.token).post('/api/usuarios').send({ ...body, email })).status).toBe(201);
    const again = await api(admin.token).post('/api/usuarios').send({ ...body, email: email.toUpperCase() });
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('Ya existe un usuario con ese correo.');
  });

  it.each([
    ['contraseña corta', { password: '123' }],
    ['rol inexistente', { role: 'superusuario' }],
    ['correo inválido', { email: 'no-es-correo' }],
    ['nombre vacío', { full_name: ' ' }],
    ['sucursal repetida', { branch_ids: ['a', 'a'] }],
    ['id de sucursal mal formado', { branch_ids: ['no-es-uuid'] }],
    ['predeterminada fuera de la lista', { default_branch_id: randomUUID() }],
  ])('rechaza (400): %s', async (_name, override) => {
    const admin = await actor('admin');
    const branch = await createTestBranch();
    const response = await api(admin.token).post('/api/usuarios').send({
      full_name: 'Valido', email: newEmail(), password: 'clave-segura-1', role: 'recepcionista',
      branch_ids: [branch.id], ...override,
    });
    expect(response.status).toBe(400);
  });

  it('una sucursal que no existe da 400 con mensaje claro', async () => {
    const admin = await actor('admin');
    const response = await api(admin.token).post('/api/usuarios').send({
      full_name: 'Valido', email: newEmail(), password: 'clave-segura-1', role: 'recepcionista',
      branch_ids: [randomUUID()],
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('no existe');
  });

  it('ignora campos que no debe aceptar (is_active, failed_login_attempts, password_hash)', async () => {
    const admin = await actor('admin');
    const branch = await createTestBranch();
    const response = await api(admin.token).post('/api/usuarios').send({
      full_name: 'Intruso', email: newEmail(), password: 'clave-segura-1', role: 'recepcionista',
      branch_ids: [branch.id], is_active: false, failed_login_attempts: 4, password_hash: 'x',
    });
    expect(response.status).toBe(201);
    expect(response.body.data.is_active).toBe(true);
    const row = await pool.query('SELECT failed_login_attempts, password_hash FROM users WHERE id = $1', [response.body.data.id]);
    expect(row.rows[0].failed_login_attempts).toBe(0);
    expect(row.rows[0].password_hash).not.toBe('x');
  });

  it('deja una entrada de auditoría con quién lo creó y SIN la contraseña', async () => {
    const admin = await actor('admin');
    const branch = await createTestBranch();
    const response = await api(admin.token).post('/api/usuarios').send({
      full_name: 'Auditado', email: newEmail(), password: 'clave-secreta-xyz', role: 'recepcionista',
      branch_ids: [branch.id],
    });
    const rows = await auditRows(response.body.data.id, 'user_created');
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_id).toBe(admin.id);
    expect(JSON.stringify(rows[0].detail)).not.toContain('clave-secreta-xyz');
  });
});

describe('Listar y consultar', () => {
  it('lista con sucursales, sin hash, y filtra por rol, estado y texto', async () => {
    const admin = await actor('admin');
    const branch = await createTestBranch();
    const marker = randomUUID().slice(0, 8);
    const created = await api(admin.token).post('/api/usuarios').send({
      full_name: `Buscable ${marker}`, email: newEmail(), password: 'clave-segura-1', role: 'encargado_venta',
      branch_ids: [branch.id],
    });

    const bySearch = await api(admin.token).get(`/api/usuarios?search=${marker.toUpperCase()}`);
    expect(bySearch.status).toBe(200);
    expect(bySearch.body.data.map((u: { id: string }) => u.id)).toEqual([created.body.data.id]);
    expect(bySearch.body.data[0]).not.toHaveProperty('password_hash');

    const wrongRole = await api(admin.token).get(`/api/usuarios?search=${marker}&role=doctor`);
    expect(wrongRole.body.data).toHaveLength(0);
    const inactive = await api(admin.token).get(`/api/usuarios?search=${marker}&is_active=false`);
    expect(inactive.body.data).toHaveLength(0);
  });

  it('un "%" en la búsqueda se trata como texto, no como comodín', async () => {
    const admin = await actor('admin');
    const response = await api(admin.token).get('/api/usuarios?search=%25');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });

  it('rechaza filtros inválidos (400)', async () => {
    const admin = await actor('admin');
    expect((await api(admin.token).get('/api/usuarios?role=reina')).status).toBe(400);
    expect((await api(admin.token).get('/api/usuarios?is_active=quizas')).status).toBe(400);
  });

  it('GET por id: 200 si existe, 404 si no, 400 si el id está mal formado', async () => {
    const admin = await actor('admin');
    expect((await api(admin.token).get(`/api/usuarios/${admin.id}`)).body.data.id).toBe(admin.id);
    expect((await api(admin.token).get(`/api/usuarios/${randomUUID()}`)).status).toBe(404);
    expect((await api(admin.token).get('/api/usuarios/no-es-uuid')).status).toBe(400);
  });
});

describe('Modificar usuario (PATCH)', () => {
  it('cambia el nombre y el rol, y audita solo lo que cambió', async () => {
    const admin = await actor('admin');
    const branch = await createTestBranch();
    const target = await actor('recepcionista', [branch.id]);

    const response = await api(admin.token).patch(`/api/usuarios/${target.id}`).send({
      full_name: 'Nombre Nuevo', role: 'doctor',
    });
    expect(response.status).toBe(200);
    expect(response.body.data.full_name).toBe('Nombre Nuevo');
    expect(response.body.data.role).toBe('doctor');

    const [row] = await auditRows(target.id, 'user_updated');
    expect(row.actor_id).toBe(admin.id);
    expect(row.detail.role).toEqual({ from: 'recepcionista', to: 'doctor' });
    expect(row.detail).not.toHaveProperty('is_active');
  });

  it('un cambio que no cambia nada no genera auditoría', async () => {
    const admin = await actor('admin');
    const target = await actor('directivo');
    const response = await api(admin.token).patch(`/api/usuarios/${target.id}`).send({ is_active: true });
    expect(response.status).toBe(200);
    expect(await auditRows(target.id, 'user_updated')).toHaveLength(0);
  });

  it('desactivar a alguien le quita el acceso AL INSTANTE (token y login)', async () => {
    const admin = await actor('admin');
    const branch = await createTestBranch();
    const target = await actor('recepcionista', [branch.id]);
    expect((await api(target.token).get('/api/auth/me')).status).toBe(200);

    await api(admin.token).patch(`/api/usuarios/${target.id}`).send({ is_active: false });

    expect((await api(target.token).get('/api/auth/me')).status).toBe(401);
    const login = await request(app).post('/api/auth/login').send({ email: target.email, password: TEST_PASSWORD });
    expect(login.status).toBe(401);
  });

  it('nadie puede cambiarse su propio rol ni desactivarse (403)', async () => {
    const admin = await actor('admin');
    const own = api(admin.token);
    expect((await own.patch(`/api/usuarios/${admin.id}`).send({ role: 'doctor' })).status).toBe(403);
    expect((await own.patch(`/api/usuarios/${admin.id}`).send({ is_active: false })).status).toBe(403);
    // Cambiarse el nombre sí se puede.
    expect((await own.patch(`/api/usuarios/${admin.id}`).send({ full_name: 'Mi Nombre' })).status).toBe(200);
  });

  it('dar un rol de sucursal a quien no tiene sucursales se rechaza (400)', async () => {
    const admin = await actor('admin');
    const target = await actor('directivo'); // sin sucursales
    const response = await api(admin.token).patch(`/api/usuarios/${target.id}`).send({ role: 'doctor' });
    expect(response.status).toBe(400);
  });

  it('rechaza cuerpo vacío, rol inválido y usuario inexistente', async () => {
    const admin = await actor('admin');
    const target = await actor('directivo');
    expect((await api(admin.token).patch(`/api/usuarios/${target.id}`).send({})).status).toBe(400);
    expect((await api(admin.token).patch(`/api/usuarios/${target.id}`).send({ role: 'x' })).status).toBe(400);
    expect((await api(admin.token).patch(`/api/usuarios/${randomUUID()}`).send({ full_name: 'Zz Zz' })).status).toBe(404);
  });

  it('ignora campos que no son editables (correo)', async () => {
    const admin = await actor('admin');
    const target = await actor('directivo');
    const response = await api(admin.token).patch(`/api/usuarios/${target.id}`).send({ full_name: 'Solo Nombre', email: 'otro@x.test' });
    expect(response.body.data.email).toBe(target.email);
  });
});

describe('Regla: siempre debe quedar un administrador activo', () => {
  it('assertAdminRemains rechaza quitar al único administrador', () => {
    expect(() => assertAdminRemains(['a'], 'a')).toThrow('al menos un administrador');
    expect(() => assertAdminRemains(['a', 'b'], 'a')).not.toThrow();
    expect(() => assertAdminRemains([], 'a')).toThrow(); // ya no hay ninguno: también se rechaza
  });
});

describe('Sucursales de un usuario (PUT)', () => {
  it('reemplaza la lista y cambia la predeterminada', async () => {
    const admin = await actor('admin');
    const [a, b, c] = [await createTestBranch(), await createTestBranch(), await createTestBranch()];
    const target = await actor('doctor', [a.id]);

    const response = await api(admin.token).put(`/api/usuarios/${target.id}/sucursales`).send({
      branch_ids: [b.id, c.id], default_branch_id: c.id,
    });
    expect(response.status).toBe(200);
    expect(response.body.data.branches.map((x: { id: string }) => x.id)).toEqual([c.id, b.id].sort((x, y) => (x === c.id ? -1 : 1)));
    expect(response.body.data.branches.find((x: { id: string }) => x.id === a.id)).toBeUndefined();

    const login = await request(app).post('/api/auth/login').send({ email: target.email, password: TEST_PASSWORD });
    expect(login.body.data.activeBranchId).toBe(c.id);
    expect(await auditRows(target.id, 'user_branches_updated')).toHaveLength(1);
  });

  it('un rol de sucursal no puede quedarse sin sucursales (400), un directivo sí', async () => {
    const admin = await actor('admin');
    const branch = await createTestBranch();
    const doctor = await actor('doctor', [branch.id]);
    const directivo = await actor('directivo', [branch.id]);
    expect((await api(admin.token).put(`/api/usuarios/${doctor.id}/sucursales`).send({ branch_ids: [] })).status).toBe(400);
    expect((await api(admin.token).put(`/api/usuarios/${directivo.id}/sucursales`).send({ branch_ids: [] })).status).toBe(200);
  });

  it('rechaza sucursales inexistentes, repetidas y usuario inexistente', async () => {
    const admin = await actor('admin');
    const branch = await createTestBranch();
    const doctor = await actor('doctor', [branch.id]);
    expect((await api(admin.token).put(`/api/usuarios/${doctor.id}/sucursales`).send({ branch_ids: [randomUUID()] })).status).toBe(400);
    expect((await api(admin.token).put(`/api/usuarios/${doctor.id}/sucursales`).send({ branch_ids: [branch.id, branch.id] })).status).toBe(400);
    expect((await api(admin.token).put(`/api/usuarios/${randomUUID()}/sucursales`).send({ branch_ids: [branch.id] })).status).toBe(404);
  });

  it('si la lista falla a la mitad no se pierde la anterior (transacción)', async () => {
    const admin = await actor('admin');
    const branch = await createTestBranch();
    const doctor = await actor('doctor', [branch.id]);
    await api(admin.token).put(`/api/usuarios/${doctor.id}/sucursales`).send({ branch_ids: [randomUUID()] });
    const after = await api(admin.token).get(`/api/usuarios/${doctor.id}`);
    expect(after.body.data.branches.map((x: { id: string }) => x.id)).toEqual([branch.id]);
  });
});

describe('Desbloquear y contraseña nueva', () => {
  it('desbloquear permite iniciar sesión de nuevo y queda auditado', async () => {
    const admin = await actor('admin');
    const branch = await createTestBranch();
    const target = await actor('recepcionista', [branch.id]);
    await pool.query(
      `UPDATE users SET failed_login_attempts = 3,
              locked_until = (now() AT TIME ZONE 'America/El_Salvador') + interval '15 minutes'
        WHERE id = $1`,
      [target.id],
    );
    const locked = await request(app).post('/api/auth/login').send({ email: target.email, password: TEST_PASSWORD });
    expect(locked.status).toBe(423);
    expect((await api(admin.token).get(`/api/usuarios/${target.id}`)).body.data.is_locked).toBe(true);

    const response = await api(admin.token).post(`/api/usuarios/${target.id}/desbloquear`);
    expect(response.status).toBe(200);
    expect(response.body.data.is_locked).toBe(false);
    const login = await request(app).post('/api/auth/login').send({ email: target.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(await auditRows(target.id, 'user_unlocked')).toHaveLength(1);
  });

  it('la contraseña nueva funciona, la vieja no, y no queda en la auditoría', async () => {
    const admin = await actor('admin');
    const branch = await createTestBranch();
    const target = await actor('recepcionista', [branch.id]);

    const response = await api(admin.token).put(`/api/usuarios/${target.id}/contrasena`).send({ password: 'clave-nueva-777' });
    expect(response.status).toBe(200);

    const oldLogin = await request(app).post('/api/auth/login').send({ email: target.email, password: TEST_PASSWORD });
    const newLogin = await request(app).post('/api/auth/login').send({ email: target.email, password: 'clave-nueva-777' });
    expect(oldLogin.status).toBe(401);
    expect(newLogin.status).toBe(200);

    const rows = await auditRows(target.id, 'user_password_reset');
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain('clave-nueva-777');
  });

  it('rechaza contraseñas cortas y usuarios inexistentes', async () => {
    const admin = await actor('admin');
    expect((await api(admin.token).put(`/api/usuarios/${admin.id}/contrasena`).send({ password: '123' })).status).toBe(400);
    expect((await api(admin.token).put(`/api/usuarios/${randomUUID()}/contrasena`).send({ password: 'clave-nueva-777' })).status).toBe(404);
    expect((await api(admin.token).post(`/api/usuarios/${randomUUID()}/desbloquear`)).status).toBe(404);
  });
});
