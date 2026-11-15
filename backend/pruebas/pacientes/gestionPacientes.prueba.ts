// =============================================================================
// gestionPacientes.prueba.ts
// Qué prueba:   la API de pacientes por HTTP: permisos por rol, registro,
//               validaciones, modificación parcial, desactivación, búsqueda
//               (nombre sin tildes, teléfono, DUI, expediente), paginación y
//               auditoría.
// Cómo:         llama a la API real (supertest) sobre la base candray_test.
// Depende de:   app.ts, ayudas/datosPrueba.ts y ayudas/datosClinicos.ts.
// =============================================================================
import { randomUUID } from 'crypto';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import { ROLES, type Role } from '../../src/configuracion/roles';
import { signToken } from '../../src/utilidades/token';
import { createTestBranch, createTestUser, type TestBranch } from '../ayudas/datosPrueba';

const app = createApp();

async function actor(role: Role, branchIds: string[] = []) {
  const user = await createTestUser({ role, branchIds });
  return { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// Un DUI válido (formato) y único: 8 dígitos al azar, guion y un dígito.
const newDui = () => `${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}-${Math.floor(Math.random() * 10)}`;

// Palabra única por paciente: así cada prueba encuentra solo lo suyo aunque
// otras pruebas creen pacientes a la vez en la misma base.
const newTag = () => `Zq${randomUUID().replace(/-/g, '').slice(0, 10)}`;

const validPatient = (overrides: Record<string, unknown> = {}) => ({
  full_name: `${newTag()} Prueba`,
  birth_date: '1990-05-17',
  phone: '7000-1111',
  ...overrides,
});

let branch: TestBranch;
let receptionist: Awaited<ReturnType<typeof actor>>;

beforeAll(async () => {
  branch = await createTestBranch();
  receptionist = await actor('recepcionista', [branch.id]);
});

// Registra un paciente como recepcionista y devuelve lo que responde la API.
async function register(overrides: Record<string, unknown> = {}) {
  const response = await request(app).post('/api/pacientes').set(auth(receptionist.token)).send(validPatient(overrides));
  expect(response.status).toBe(201);
  return response.body.data as { id: string; record_number: number; full_name: string; phone: string; dui: string | null };
}

const search = (query: string, token = receptionist.token) =>
  request(app).get(`/api/pacientes?${query}`).set(auth(token));

describe('Permisos de /api/pacientes', () => {
  it('sin token responde 401', async () => {
    expect((await request(app).get('/api/pacientes')).status).toBe(401);
  });

  it('el directivo recibe 403 en todas las rutas', async () => {
    const { token } = await actor('directivo');
    const patient = await register();
    expect((await search('', token)).status).toBe(403);
    expect((await request(app).get(`/api/pacientes/${patient.id}`).set(auth(token))).status).toBe(403);
    expect((await request(app).post('/api/pacientes').set(auth(token)).send(validPatient())).status).toBe(403);
    expect((await request(app).patch(`/api/pacientes/${patient.id}`).set(auth(token)).send({ phone: '7000-2222' })).status).toBe(403);
  });

  it.each(['doctor', 'encargado_venta'] as Role[])('%s puede buscar y ver, pero no registrar ni modificar', async (role) => {
    const { token } = await actor(role, [branch.id]);
    const patient = await register();
    expect((await search('', token)).status).toBe(200);
    expect((await request(app).get(`/api/pacientes/${patient.id}`).set(auth(token))).status).toBe(200);
    expect((await request(app).post('/api/pacientes').set(auth(token)).send(validPatient())).status).toBe(403);
    expect((await request(app).patch(`/api/pacientes/${patient.id}`).set(auth(token)).send({ phone: '7000-2222' })).status).toBe(403);
  });

  it('el administrador puede buscar', async () => {
    const { token } = await actor('admin', [branch.id]);
    expect((await search('', token)).status).toBe(200);
  });

  it('cada rol recibe lo que dice la tabla de permisos', async () => {
    const expectedToSearch: Role[] = ['admin', 'doctor', 'recepcionista', 'encargado_venta'];
    for (const role of ROLES) {
      const { token } = await actor(role, role === 'directivo' ? [] : [branch.id]);
      expect((await search('page_size=1', token)).status).toBe(expectedToSearch.includes(role) ? 200 : 403);
    }
  });

  it('la recepcionista sin sucursales asignadas no puede registrar (403)', async () => {
    const { token } = await actor('recepcionista', []);
    expect((await request(app).post('/api/pacientes').set(auth(token)).send(validPatient())).status).toBe(403);
  });

  it('pedir una sucursal ajena al registrar responde 403', async () => {
    const other = await createTestBranch();
    const response = await request(app)
      .post('/api/pacientes')
      .set(auth(receptionist.token))
      .set('X-Sucursal-Id', other.id)
      .send(validPatient());
    expect(response.status).toBe(403);
  });
});

describe('Registrar un paciente', () => {
  it('guarda los datos, asigna el expediente y deja opcionales en null', async () => {
    const body = validPatient();
    const response = await request(app).post('/api/pacientes').set(auth(receptionist.token)).send(body);
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      full_name: body.full_name, birth_date: '1990-05-17', phone: '7000-1111',
      dui: null, email: null, is_active: true,
    });
    expect(response.body.data.record_number).toEqual(expect.any(Number));
  });

  it('los expedientes nuevos son distintos y crecen', async () => {
    const first = await register();
    const second = await register();
    expect(second.record_number).toBeGreaterThan(first.record_number);
  });

  it('limpia espacios y pasa el correo a minúsculas', async () => {
    const tag = newTag();
    const patient = await register({ full_name: `  ${tag} Luna  `, email: '  Luna.Prueba@Correo.TEST ' });
    expect(patient.full_name).toBe(`${tag} Luna`);
    const response = await request(app).get(`/api/pacientes/${patient.id}`).set(auth(receptionist.token));
    expect(response.body.data.email).toBe('luna.prueba@correo.test');
  });

  it('DUI y correo vacíos se guardan como "sin dato"', async () => {
    const response = await request(app)
      .post('/api/pacientes').set(auth(receptionist.token)).send(validPatient({ dui: '', email: '   ' }));
    expect(response.status).toBe(201);
    expect(response.body.data.dui).toBeNull();
    expect(response.body.data.email).toBeNull();
  });

  it('ignora el número de expediente y el estado enviados por el cliente', async () => {
    const response = await request(app)
      .post('/api/pacientes').set(auth(receptionist.token))
      .send(validPatient({ record_number: 1, is_active: false, id: randomUUID() }));
    expect(response.status).toBe(201);
    expect(response.body.data.record_number).not.toBe(1);
    expect(response.body.data.is_active).toBe(true);
  });

  it('un DUI repetido responde 409 con un mensaje claro', async () => {
    const dui = newDui();
    await register({ dui });
    const response = await request(app).post('/api/pacientes').set(auth(receptionist.token)).send(validPatient({ dui }));
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Ya existe un paciente con ese DUI.');
  });

  it.each([
    ['nombre muy corto', { full_name: 'A' }],
    ['sin nombre', { full_name: undefined }],
    ['fecha con otro formato', { birth_date: '17/05/1990' }],
    ['fecha que no existe', { birth_date: '2026-02-31' }],
    ['fecha anterior a 1900', { birth_date: '1899-12-31' }],
    ['fecha futura', { birth_date: '2999-01-01' }],
    ['sin fecha', { birth_date: undefined }],
    ['teléfono con letras', { phone: 'abcdefgh' }],
    ['teléfono muy corto', { phone: '123' }],
    ['teléfono muy largo', { phone: '1'.repeat(31) }],
    ['sin teléfono', { phone: undefined }],
    ['DUI mal escrito', { dui: '1234' }],
    ['DUI sin guion', { dui: '012345678' }],
    ['correo inválido', { email: 'no-es-correo' }],
  ])('rechaza con 400: %s', async (_name, overrides) => {
    const response = await request(app).post('/api/pacientes').set(auth(receptionist.token)).send(validPatient(overrides));
    expect(response.status).toBe(400);
  });

  it('acepta a alguien nacido hoy', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date());
    const response = await request(app).post('/api/pacientes').set(auth(receptionist.token)).send(validPatient({ birth_date: today }));
    expect(response.status).toBe(201);
  });

  it('deja una entrada de auditoría con quién y en qué sucursal, sin datos personales', async () => {
    const patient = await register({ phone: '7123-9876' });
    const audit = await pool.query(
      `SELECT actor_id, branch_id, detail FROM audit_log
        WHERE entity_type = 'patient' AND action = 'patient_created' AND entity_id = $1`,
      [patient.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_id).toBe(receptionist.id);
    expect(audit.rows[0].branch_id).toBe(branch.id);
    expect(JSON.stringify(audit.rows[0])).not.toContain('7123-9876');
  });
});

describe('Ver un paciente', () => {
  it('devuelve el paciente', async () => {
    const patient = await register();
    const response = await request(app).get(`/api/pacientes/${patient.id}`).set(auth(receptionist.token));
    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(patient.id);
  });

  it('responde 404 si no existe y 400 si el id está mal escrito', async () => {
    expect((await request(app).get(`/api/pacientes/${randomUUID()}`).set(auth(receptionist.token))).status).toBe(404);
    expect((await request(app).get('/api/pacientes/no-es-un-uuid').set(auth(receptionist.token))).status).toBe(400);
  });
});

describe('Modificar un paciente', () => {
  const patch = (id: string, body: Record<string, unknown>) =>
    request(app).patch(`/api/pacientes/${id}`).set(auth(receptionist.token)).send(body);

  it('cambia solo los campos enviados', async () => {
    const patient = await register({ dui: newDui() });
    const response = await patch(patient.id, { phone: '7999-0000' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ phone: '7999-0000', full_name: patient.full_name, dui: patient.dui });
  });

  it('puede borrar el DUI y el correo con null o texto vacío', async () => {
    const patient = await register({ dui: newDui(), email: 'a@correo.test' });
    const response = await patch(patient.id, { dui: null, email: '' });
    expect(response.status).toBe(200);
    expect(response.body.data.dui).toBeNull();
    expect(response.body.data.email).toBeNull();
  });

  it('no cambia el número de expediente aunque se envíe', async () => {
    const patient = await register();
    const response = await patch(patient.id, { record_number: 999999, phone: '7999-0000' });
    expect(response.body.data.record_number).toBe(patient.record_number);
  });

  it('usar el DUI de otro paciente responde 409', async () => {
    const dui = newDui();
    await register({ dui });
    const other = await register();
    const response = await patch(other.id, { dui });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Ya existe un paciente con ese DUI.');
  });

  it('conservar su propio DUI no es un conflicto', async () => {
    const dui = newDui();
    const patient = await register({ dui });
    expect((await patch(patient.id, { dui, phone: '7999-0000' })).status).toBe(200);
  });

  it.each([
    ['cuerpo vacío', {}],
    ['fecha futura', { birth_date: '2999-01-01' }],
    ['teléfono inválido', { phone: 'xx' }],
    ['nombre vacío', { full_name: '' }],
    ['teléfono nulo', { phone: null }],
  ])('rechaza con 400: %s', async (_name, body) => {
    const patient = await register();
    expect((await patch(patient.id, body)).status).toBe(400);
  });

  it('un cuerpo vacío explica que falta indicar un campo', async () => {
    const patient = await register();
    const response = await patch(patient.id, {});
    expect(response.body.errors[0].message).toBe('Indique al menos un campo para modificar');
  });

  it('responde 404 si el paciente no existe', async () => {
    expect((await patch(randomUUID(), { phone: '7999-0000' })).status).toBe(404);
  });

  it('audita solo los NOMBRES de los campos que cambiaron', async () => {
    const patient = await register({ phone: '7111-2222' });
    await patch(patient.id, { phone: '7333-4444', full_name: `${newTag()} Nuevo` });
    const audit = await pool.query(
      `SELECT branch_id, detail FROM audit_log
        WHERE entity_type = 'patient' AND action = 'patient_updated' AND entity_id = $1`,
      [patient.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].detail.fields.sort()).toEqual(['full_name', 'phone']);
    expect(audit.rows[0].branch_id).toBe(branch.id);
    expect(JSON.stringify(audit.rows[0])).not.toContain('7333-4444');
  });

  it('si no cambia nada, no deja auditoría', async () => {
    const patient = await register({ phone: '7111-2222' });
    expect((await patch(patient.id, { phone: '7111-2222' })).status).toBe(200);
    const audit = await pool.query(
      `SELECT 1 FROM audit_log WHERE action = 'patient_updated' AND entity_id = $1`,
      [patient.id],
    );
    expect(audit.rows).toHaveLength(0);
  });

  it('desactivar oculta al paciente de la búsqueda normal, y reactivar lo devuelve', async () => {
    const tag = newTag();
    const patient = await register({ full_name: `${tag} Inactivo` });
    expect((await search(`q=${tag}`)).body.data).toHaveLength(1);

    expect((await patch(patient.id, { is_active: false })).body.data.is_active).toBe(false);
    expect((await search(`q=${tag}`)).body.data).toHaveLength(0);
    expect((await search(`q=${tag}&include_inactive=true`)).body.data).toHaveLength(1);

    await patch(patient.id, { is_active: true });
    expect((await search(`q=${tag}`)).body.data).toHaveLength(1);
  });
});

describe('Buscar pacientes', () => {
  it('encuentra por nombre sin importar tildes ni mayúsculas', async () => {
    const tag = newTag();
    await register({ full_name: `María García ${tag}` });
    for (const q of [`maria garcia ${tag}`, `MARÍA GARCÍA ${tag}`, `garcia ${tag}`]) {
      expect((await search(`q=${encodeURIComponent(q)}`)).body.data).toHaveLength(1);
    }
  });

  it('las palabras pueden ir en cualquier orden y deben estar todas', async () => {
    const tag = newTag();
    await register({ full_name: `José Luis ${tag}` });
    expect((await search(`q=${encodeURIComponent(`${tag} luis jose`)}`)).body.data).toHaveLength(1);
    expect((await search(`q=${encodeURIComponent(`${tag} pedro`)}`)).body.data).toHaveLength(0);
  });

  it('encuentra por una parte del nombre', async () => {
    const tag = newTag();
    await register({ full_name: `${tag}ito Fernández` });
    expect((await search(`q=${tag.slice(0, 8)}`)).body.data).toHaveLength(1);
  });

  it('encuentra por teléfono', async () => {
    const phone = `7${Math.floor(100 + Math.random() * 899)}-${Math.floor(1000 + Math.random() * 8999)}`;
    const patient = await register({ phone });
    const ids = (await search(`q=${phone}`)).body.data.map((row: { id: string }) => row.id);
    expect(ids).toContain(patient.id);
  });

  it('encuentra por DUI completo o por su comienzo', async () => {
    const dui = newDui();
    const patient = await register({ dui });
    for (const q of [dui, dui.slice(0, 6)]) {
      const ids = (await search(`q=${q}`)).body.data.map((row: { id: string }) => row.id);
      expect(ids).toContain(patient.id);
    }
  });

  it('encuentra por número de expediente', async () => {
    const patient = await register();
    const ids = (await search(`q=${patient.record_number}`)).body.data.map((row: { id: string }) => row.id);
    expect(ids).toContain(patient.id);
  });

  it('el signo % no funciona como comodín', async () => {
    await register();
    const rows = (await search('q=%25&page_size=100')).body.data as { full_name: string; phone: string; dui: string | null }[];
    for (const row of rows) {
      expect(`${row.full_name}|${row.phone}|${row.dui ?? ''}`).toContain('%');
    }
  });

  it('sin texto devuelve pacientes (el orden por nombre se comprueba en la paginación)', async () => {
    await register();
    const response = await search('page_size=100');
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('pagina los resultados y calcula el total', async () => {
    const tag = newTag();
    for (const suffix of ['A', 'B', 'C']) await register({ full_name: `${tag} ${suffix}` });
    const first = await search(`q=${tag}&page_size=2&page=1`);
    expect(first.body.data.map((row: { full_name: string }) => row.full_name)).toEqual([`${tag} A`, `${tag} B`]);
    expect(first.body.pagination).toEqual({ page: 1, page_size: 2, total: 3, total_pages: 2 });
    const second = await search(`q=${tag}&page_size=2&page=2`);
    expect(second.body.data.map((row: { full_name: string }) => row.full_name)).toEqual([`${tag} C`]);
  });

  it.each(['page=0', 'page_size=0', 'page_size=101', 'include_inactive=quizas', `q=${'x'.repeat(101)}`])(
    'rechaza con 400 el filtro %s',
    async (query) => {
      expect((await search(query)).status).toBe(400);
    },
  );
});
