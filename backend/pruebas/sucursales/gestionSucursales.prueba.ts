// =============================================================================
// gestionSucursales.prueba.ts
// Qué prueba:   la administración de sucursales por HTTP: permisos por rol,
//               creación, validaciones, modificación parcial, desactivación y
//               auditoría.
// Cómo:         llama a la API real (supertest) sobre la base candray_test.
// Depende de:   app.ts y ayudas/datosPrueba.ts.
// =============================================================================
import { randomUUID } from 'crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import { ROLES, type Role } from '../../src/configuracion/roles';
import { signToken } from '../../src/utilidades/token';
import { createTestBranch, createTestUser, TEST_PASSWORD } from '../ayudas/datosPrueba';

const app = createApp();

async function actor(role: Role, branchIds: string[] = []) {
  const user = await createTestUser({ role, branchIds });
  return { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// Código único válido (solo A-Z, 0-9 y _).
const newCode = () => `S${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;

const validBranch = () => ({
  code: newCode(),
  name: 'Sucursal de Prueba',
  address: 'Calle 1',
  phone: '2222-9999',
  opening_time: '08:00',
  closing_time: '17:00',
});

describe('Permisos de /api/sucursales', () => {
  it('sin token responde 401', async () => {
    expect((await request(app).get('/api/sucursales')).status).toBe(401);
  });

  it.each(ROLES.filter((role) => role !== 'admin'))('%s recibe 403', async (role) => {
    const branch = await createTestBranch();
    const { token } = await actor(role, role === 'directivo' ? [] : [branch.id]);
    expect((await request(app).get('/api/sucursales').set(auth(token))).status).toBe(403);
    expect((await request(app).post('/api/sucursales').set(auth(token)).send(validBranch())).status).toBe(403);
    expect((await request(app).patch(`/api/sucursales/${branch.id}`).set(auth(token)).send({ name: 'Xx' })).status).toBe(403);
  });
});

describe('Crear sucursal', () => {
  it('crea con valores por defecto, la audita, y aparece en el listado', async () => {
    const admin = await actor('admin');
    const body = validBranch();
    const response = await request(app).post('/api/sucursales').set(auth(admin.token)).send(body);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      code: body.code, is_active: true, has_optical_counter: false, theme_color: '#0F766E', user_count: 0,
    });
    const list = await request(app).get('/api/sucursales').set(auth(admin.token));
    expect(list.body.data.map((b: { code: string }) => b.code)).toContain(body.code);

    const audit = await pool.query(`SELECT actor_id FROM audit_log WHERE entity_id = $1 AND action = 'branch_created'`, [response.body.data.id]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_id).toBe(admin.id);
  });

  it('un código repetido da 409 con mensaje claro', async () => {
    const admin = await actor('admin');
    const body = validBranch();
    await request(app).post('/api/sucursales').set(auth(admin.token)).send(body);
    const again = await request(app).post('/api/sucursales').set(auth(admin.token)).send(body);
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('Ya existe una sucursal con ese código.');
  });

  it.each([
    ['código en minúsculas', { code: 'central' }],
    ['código con espacios', { code: 'SANTA TECLA' }],
    ['código muy largo', { code: 'A'.repeat(21) }],
    ['color inválido', { theme_color: 'rojo' }],
    ['hora inválida', { opening_time: '25:00' }],
    ['hora sin formato', { closing_time: '5pm' }],
    ['apertura igual al cierre', { opening_time: '09:00', closing_time: '09:00' }],
    ['apertura posterior al cierre', { opening_time: '18:00', closing_time: '08:00' }],
    ['nombre vacío', { name: '' }],
  ])('rechaza (400): %s', async (_name, override) => {
    const admin = await actor('admin');
    const response = await request(app).post('/api/sucursales').set(auth(admin.token)).send({ ...validBranch(), ...override });
    expect(response.status).toBe(400);
  });
});

describe('Horario al crear', () => {
  it('apertura posterior al cierre da un mensaje claro', async () => {
    const admin = await actor('admin');
    const response = await request(app).post('/api/sucursales').set(auth(admin.token)).send({ ...validBranch(), opening_time: '18:00', closing_time: '08:00' });
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('apertura');
  });
});

describe('Modificar sucursal (PATCH)', () => {
  it('cambia solo los campos enviados y audita lo que cambió', async () => {
    const admin = await actor('admin');
    const created = await request(app).post('/api/sucursales').set(auth(admin.token)).send(validBranch());
    const id = created.body.data.id;

    const response = await request(app).patch(`/api/sucursales/${id}`).set(auth(admin.token)).send({
      name: 'Nombre Nuevo', theme_color: '#1D4ED8', has_optical_counter: true,
    });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ name: 'Nombre Nuevo', theme_color: '#1D4ED8', has_optical_counter: true, address: 'Calle 1' });

    const audit = await pool.query(`SELECT detail FROM audit_log WHERE entity_id = $1 AND action = 'branch_updated'`, [id]);
    expect(Object.keys(audit.rows[0].detail).sort()).toEqual(['has_optical_counter', 'name', 'theme_color']);
  });

  it('el código no se puede cambiar (se ignora)', async () => {
    const admin = await actor('admin');
    const created = await request(app).post('/api/sucursales').set(auth(admin.token)).send(validBranch());
    const response = await request(app).patch(`/api/sucursales/${created.body.data.id}`).set(auth(admin.token)).send({ code: 'OTRO', name: 'Mismo Codigo' });
    expect(response.body.data.code).toBe(created.body.data.code);
  });

  it('se puede borrar la dirección enviando null o vacío', async () => {
    const admin = await actor('admin');
    const created = await request(app).post('/api/sucursales').set(auth(admin.token)).send(validBranch());
    const response = await request(app).patch(`/api/sucursales/${created.body.data.id}`).set(auth(admin.token)).send({ address: '', phone: null });
    expect(response.body.data.address).toBeNull();
    expect(response.body.data.phone).toBeNull();
  });

  it('el horario se valida contra el valor GUARDADO al cambiar solo uno', async () => {
    const admin = await actor('admin');
    const created = await request(app).post('/api/sucursales').set(auth(admin.token)).send(validBranch()); // 08:00 - 17:00
    const id = created.body.data.id;
    // Cierre antes de la apertura guardada.
    const early = await request(app).patch(`/api/sucursales/${id}`).set(auth(admin.token)).send({ closing_time: '07:00' });
    expect(early.status).toBe(400);
    expect(early.body.message).toContain('apertura'); // mensaje claro del servicio, no el genérico de la base
    // Apertura después del cierre guardado.
    const late = await request(app).patch(`/api/sucursales/${id}`).set(auth(admin.token)).send({ opening_time: '18:00' });
    expect(late.status).toBe(400);
    expect(late.body.message).toContain('apertura');
    // Un cambio válido sí pasa.
    const ok = await request(app).patch(`/api/sucursales/${id}`).set(auth(admin.token)).send({ closing_time: '19:30' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.closing_time.slice(0, 5)).toBe('19:30');
  });

  it('desactivarla la quita del selector de sus usuarios, y reactivarla la devuelve', async () => {
    const admin = await actor('admin');
    const [keep, toggle] = [await createTestBranch(), await createTestBranch()];
    const doctor = await actor('doctor', [keep.id, toggle.id]);
    const login = () => request(app).post('/api/auth/login').send({ email: doctor.email, password: TEST_PASSWORD });

    expect((await login()).body.data.branches).toHaveLength(2);
    await request(app).patch(`/api/sucursales/${toggle.id}`).set(auth(admin.token)).send({ is_active: false });
    expect((await login()).body.data.branches.map((b: { id: string }) => b.id)).toEqual([keep.id]);

    const listed = await request(app).get('/api/sucursales').set(auth(admin.token));
    const row = listed.body.data.find((b: { id: string }) => b.id === toggle.id);
    expect(row).toMatchObject({ is_active: false, user_count: 1 }); // sigue en el listado de administración

    await request(app).patch(`/api/sucursales/${toggle.id}`).set(auth(admin.token)).send({ is_active: true });
    expect((await login()).body.data.branches).toHaveLength(2);
  });

  it('rechaza cuerpo vacío, color inválido, id mal formado y sucursal inexistente', async () => {
    const admin = await actor('admin');
    const branch = await createTestBranch();
    expect((await request(app).patch(`/api/sucursales/${branch.id}`).set(auth(admin.token)).send({})).status).toBe(400);
    expect((await request(app).patch(`/api/sucursales/${branch.id}`).set(auth(admin.token)).send({ theme_color: 'azul' })).status).toBe(400);
    expect((await request(app).patch('/api/sucursales/no-es-uuid').set(auth(admin.token)).send({ name: 'Xx' })).status).toBe(400);
    expect((await request(app).patch(`/api/sucursales/${randomUUID()}`).set(auth(admin.token)).send({ name: 'Xx' })).status).toBe(404);
    expect((await request(app).get(`/api/sucursales/${randomUUID()}`).set(auth(admin.token))).status).toBe(404);
  });

  it('no existe DELETE: las sucursales no se borran', async () => {
    const admin = await actor('admin');
    const branch = await createTestBranch();
    expect((await request(app).delete(`/api/sucursales/${branch.id}`).set(auth(admin.token))).status).toBe(404);
  });
});
