// =============================================================================
// gestionOrdenesOptica.prueba.ts
// Qué prueba:   la API de órdenes de óptica por HTTP: quién puede crear, ver y
//               avanzar órdenes, las validaciones, la receta vigente y el
//               consentimiento, el aislamiento por sucursal, el flujo de estados
//               con su historia, lo que NO se filtra hacia la óptica, y la
//               constancia en la bitácora.
// Cómo:         llama a la API real (supertest) sobre la base candray_test.
// Depende de:   app.ts y las ayudas de prueba.
// =============================================================================
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { pool } from '../../src/configuracion/baseDatos';
import type { Role } from '../../src/configuracion/roles';
import * as auditModel from '../../src/modelos/auditoria';
import { signToken } from '../../src/utilidades/token';
import {
  createTestPatient, insertAppointment, insertConsent, insertMedicalRecord, insertPrescription,
} from '../ayudas/datosClinicos';
import { createTestBranch, createTestUser, type TestBranch } from '../ayudas/datosPrueba';

const app = createApp();

async function actor(role: Role, branchIds: string[] = []) {
  const user = await createTestUser({ role, branchIds });
  return { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
}
type Actor = Awaited<ReturnType<typeof actor>>;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const UUID_THAT_DOES_NOT_EXIST = '00000000-0000-0000-0000-000000000000';
const BODY = { frame_description: 'Armazón metálico negro', lens_description: 'Lentes con antirreflejo', total_amount: 120, deposit_amount: 40 };

let central: TestBranch;
let escalon: TestBranch;
let seller: Actor;
let doctor: Actor;
let dayCounter = 0;

beforeAll(async () => {
  central = await createTestBranch();
  escalon = await createTestBranch();
  seller = await actor('encargado_venta', [central.id]);
  doctor = await actor('doctor', [central.id]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Un paciente con la receta emitida por el médico y, si se pide, su consentimiento.
async function scene(options: { consent?: boolean; revokedConsent?: boolean; inactive?: boolean } = {}) {
  const { consent = true, revokedConsent = false, inactive = false } = options;
  const patient = await createTestPatient();
  dayCounter += 1;
  const day = new Date(Date.UTC(2020, 0, 1 + dayCounter)).toISOString().slice(0, 10);
  const appointmentId = (
    await insertAppointment({
      patientId: patient.id, doctorId: doctor.id, branchId: central.id, createdBy: seller.id, startsAt: `${day} 08:00`,
    })
  ).rows[0].id;
  const recordId = (
    await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, appointmentId, diagnosis: 'Diagnóstico privado' })
  ).rows[0].id;
  const prescriptionId = (
    await insertPrescription({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, recordId })
  ).rows[0].id;
  if (consent) {
    await insertConsent({ patientId: patient.id, grantedBy: doctor.id, revokedBy: revokedConsent ? doctor.id : undefined });
  }
  if (inactive) await pool.query('UPDATE patients SET is_active = false WHERE id = $1', [patient.id]);
  return { patient, recordId, prescriptionId };
}

const create = (token: string, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  request(app).post('/api/ordenes-optica').set(auth(token)).set(headers).send(body);
const list = (token: string, query = '', headers: Record<string, string> = {}) =>
  request(app).get(`/api/ordenes-optica${query}`).set(auth(token)).set(headers);
const get = (token: string, id: string, headers: Record<string, string> = {}) =>
  request(app).get(`/api/ordenes-optica/${id}`).set(auth(token)).set(headers);
const change = (token: string, id: string, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  request(app).post(`/api/ordenes-optica/${id}/estado`).set(auth(token)).set(headers).send(body);

const auditRows = async (action: string, entityId: string) =>
  (await pool.query('SELECT * FROM audit_log WHERE action = $1 AND entity_id = $2', [action, entityId])).rows;

// Crea una orden por la API y devuelve su id.
async function created(token = seller.token, extra: Record<string, unknown> = {}, sceneOptions = {}) {
  const { prescriptionId, patient } = await scene(sceneOptions);
  const response = await create(token, { prescription_id: prescriptionId, ...BODY, ...extra });
  expect(response.status).toBe(201);
  return { id: response.body.data.id as string, patient, prescriptionId };
}

// -----------------------------------------------------------------------------
describe('permisos por rol', () => {
  it('sin token: 401 en las cuatro rutas', async () => {
    expect((await request(app).get('/api/ordenes-optica')).status).toBe(401);
    expect((await request(app).get(`/api/ordenes-optica/${UUID_THAT_DOES_NOT_EXIST}`)).status).toBe(401);
    expect((await request(app).post('/api/ordenes-optica').send({})).status).toBe(401);
    expect((await request(app).post(`/api/ordenes-optica/${UUID_THAT_DOES_NOT_EXIST}/estado`).send({})).status).toBe(401);
  });

  it.each(['doctor', 'recepcionista', 'directivo'] as const)('%s no puede ver ni crear ni avanzar (403)', async (role) => {
    const user = await actor(role, [central.id]);
    for (const response of [
      await list(user.token),
      await get(user.token, UUID_THAT_DOES_NOT_EXIST),
      await create(user.token, { prescription_id: UUID_THAT_DOES_NOT_EXIST, ...BODY }),
      await change(user.token, UUID_THAT_DOES_NOT_EXIST, { status: 'in_lab' }),
    ]) {
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('No tiene permisos para realizar esta acción.');
    }
  });

  it('la capacidad se revisa antes de validar el cuerpo', async () => {
    const user = await actor('doctor', [central.id]);
    expect((await create(user.token, {})).status).toBe(403);
  });

  it('el encargado de ventas crea, ve y avanza', async () => {
    const { id } = await created();
    expect((await get(seller.token, id)).status).toBe(200);
    expect((await list(seller.token)).status).toBe(200);
    expect((await change(seller.token, id, { status: 'in_lab' })).status).toBe(200);
  });

  it('el administrador (perfil demostración) también puede crear y ver', async () => {
    const admin = await actor('admin');
    const { prescriptionId } = await scene();
    const response = await create(admin.token, { prescription_id: prescriptionId, ...BODY }, { 'X-Sucursal-Id': central.id });
    expect(response.status).toBe(201);
    expect((await list(admin.token)).status).toBe(200);
  });
});

// -----------------------------------------------------------------------------
describe('crear una orden', () => {
  it('crea la orden pendiente en la sucursal activa, con su historia y los saldos', async () => {
    const { prescriptionId, patient } = await scene();
    const response = await create(seller.token, { prescription_id: prescriptionId, ...BODY, notes: 'Entrega urgente' });
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      patient_id: patient.id, patient_name: expect.any(String), patient_record_number: patient.record_number,
      prescription_id: prescriptionId, prescription_is_current: true,
      branch_id: central.id, branch_name: expect.any(String), created_by: seller.id, created_by_name: expect.any(String),
      frame_description: 'Armazón metálico negro', lens_description: 'Lentes con antirreflejo',
      total_amount: 120, deposit_amount: 40, balance: 80, notes: 'Entrega urgente',
      status: 'pending', cancellation_reason: null,
    });
    expect(response.body.data.events).toEqual([
      expect.objectContaining({ from_status: null, to_status: 'pending', changed_by: seller.id, changed_by_name: expect.any(String) }),
    ]);
  });

  it('quita los espacios de los lados y trata las notas vacías como ausentes; el anticipo vale 0 por omisión', async () => {
    const { prescriptionId } = await scene();
    const response = await create(seller.token, {
      prescription_id: prescriptionId, frame_description: '  Armazón  ', lens_description: ' Lentes ', total_amount: 80, notes: '   ',
    });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ frame_description: 'Armazón', lens_description: 'Lentes', deposit_amount: 0, balance: 80, notes: null });
  });

  it('usa la sucursal que indica la cabecera, si la persona tiene acceso', async () => {
    const wide = await actor('encargado_venta', [central.id, escalon.id]);
    const { prescriptionId } = await scene();
    const response = await create(wide.token, { prescription_id: prescriptionId, ...BODY }, { 'X-Sucursal-Id': escalon.id });
    expect(response.status).toBe(201);
    expect(response.body.data.branch_id).toBe(escalon.id);
  });

  it('ignora los datos que no se envían por el cuerpo (paciente, sucursal, estado, quién)', async () => {
    const { prescriptionId, patient } = await scene();
    const response = await create(seller.token, {
      prescription_id: prescriptionId, ...BODY,
      patient_id: UUID_THAT_DOES_NOT_EXIST, branch_id: escalon.id, created_by: doctor.id, status: 'delivered',
    });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ patient_id: patient.id, branch_id: central.id, created_by: seller.id, status: 'pending' });
  });

  it('la bitácora guarda la creación con sucursal, paciente y receta', async () => {
    const { id, patient, prescriptionId } = await created();
    const [row] = await auditRows('optical_order_created', id);
    expect(row).toMatchObject({ entity_type: 'optical_order', actor_id: seller.id, branch_id: central.id });
    expect(row.detail).toEqual({ patient_id: patient.id, prescription_id: prescriptionId });
  });

  it('no filtra datos clínicos: ni medidas ni diagnóstico ni el médico', async () => {
    const { id } = await created();
    const text = JSON.stringify((await get(seller.token, id)).body) + JSON.stringify((await list(seller.token)).body);
    expect(text).not.toContain('Diagnóstico privado');
    expect(text).not.toMatch(/od_sphere|oi_sphere|pupillary|doctor/);
  });

  describe('validaciones del cuerpo (400)', () => {
    it.each([
      ['sin receta', { prescription_id: undefined }, 'prescription_id'],
      ['receta que no es un uuid', { prescription_id: 'abc' }, 'prescription_id'],
      ['sin armazón', { frame_description: undefined }, 'frame_description'],
      ['armazón en blanco', { frame_description: '   ' }, 'frame_description'],
      ['armazón muy largo', { frame_description: 'a'.repeat(201) }, 'frame_description'],
      ['sin lentes', { lens_description: undefined }, 'lens_description'],
      ['lentes muy largo', { lens_description: 'a'.repeat(201) }, 'lens_description'],
      ['sin total', { total_amount: undefined }, 'total_amount'],
      ['total en cero', { total_amount: 0 }, 'total_amount'],
      ['total negativo', { total_amount: -1 }, 'total_amount'],
      ['total como texto', { total_amount: '120' }, 'total_amount'],
      ['total con tres decimales', { total_amount: 10.005 }, 'total_amount'],
      ['total que no cabe', { total_amount: 100000 }, 'total_amount'],
      ['anticipo negativo', { deposit_amount: -1 }, 'deposit_amount'],
      ['anticipo con tres decimales', { deposit_amount: 1.001 }, 'deposit_amount'],
      ['anticipo mayor que el total', { total_amount: 50, deposit_amount: 50.01 }, 'deposit_amount'],
      ['nota muy larga', { notes: 'a'.repeat(501) }, 'notes'],
    ])('%s', async (_name, change_, field) => {
      const { prescriptionId } = await scene();
      const response = await create(seller.token, { prescription_id: prescriptionId, ...BODY, ...change_ });
      expect(response.status).toBe(400);
      expect(response.body.errors.map((e: { field: string }) => e.field)).toContain(field);
    });

    it('acepta el anticipo igual al total y el máximo de cada texto', async () => {
      const { prescriptionId } = await scene();
      const response = await create(seller.token, {
        prescription_id: prescriptionId, frame_description: 'a'.repeat(200), lens_description: 'b'.repeat(200),
        total_amount: 99999.99, deposit_amount: 99999.99, notes: 'c'.repeat(500),
      });
      expect(response.status).toBe(201);
      expect(response.body.data.balance).toBe(0);
    });

    it('un valor con centavos se guarda exacto', async () => {
      const { prescriptionId } = await scene();
      const response = await create(seller.token, { prescription_id: prescriptionId, ...BODY, total_amount: 99.99, deposit_amount: 0.01 });
      expect(response.body.data).toMatchObject({ total_amount: 99.99, deposit_amount: 0.01 });
    });
  });

  describe('la receta, el paciente y el consentimiento', () => {
    it('una receta que no existe es 404', async () => {
      const response = await create(seller.token, { prescription_id: UUID_THAT_DOES_NOT_EXIST, ...BODY });
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Receta no encontrada.');
    });

    it('sin consentimiento: 403 y queda en la bitácora; no se crea la orden', async () => {
      const { prescriptionId, patient } = await scene({ consent: false });
      const response = await create(seller.token, { prescription_id: prescriptionId, ...BODY });
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('El paciente no ha autorizado que la óptica use su receta.');
      const [row] = await auditRows('optical_order_denied', patient.id);
      expect(row).toMatchObject({ entity_type: 'patient', actor_id: seller.id, branch_id: central.id });
      expect(row.detail).toEqual({ reason: 'no_consent', prescription_id: prescriptionId });
      expect((await pool.query('SELECT 1 FROM optical_orders WHERE patient_id = $1', [patient.id])).rowCount).toBe(0);
    });

    it('con el consentimiento revocado: 403', async () => {
      const { prescriptionId } = await scene({ revokedConsent: true });
      expect((await create(seller.token, { prescription_id: prescriptionId, ...BODY })).status).toBe(403);
    });

    it('si la bitácora falla al negar, no se crea la orden y responde error', async () => {
      vi.spyOn(auditModel, 'createAuditEntry').mockRejectedValueOnce(new Error('bitácora caída'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { prescriptionId, patient } = await scene({ consent: false });
      const response = await create(seller.token, { prescription_id: prescriptionId, ...BODY });
      expect(response.status).toBe(500);
      expect((await pool.query('SELECT 1 FROM optical_orders WHERE patient_id = $1', [patient.id])).rowCount).toBe(0);
    });

    it('una receta reemplazada es 409: se debe usar la vigente', async () => {
      const { prescriptionId, patient, recordId } = await scene();
      await insertPrescription({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, recordId, supersedesId: prescriptionId });
      const response = await create(seller.token, { prescription_id: prescriptionId, ...BODY });
      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Esa receta fue reemplazada. Use la receta vigente del paciente.');
    });

    it('el consentimiento se revisa antes que la vigencia: sin él no se revela que fue reemplazada', async () => {
      const { prescriptionId, patient, recordId } = await scene({ consent: false });
      await insertPrescription({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, recordId, supersedesId: prescriptionId });
      expect((await create(seller.token, { prescription_id: prescriptionId, ...BODY })).status).toBe(403);
    });

    it('un paciente inactivo es 409', async () => {
      const { prescriptionId } = await scene({ inactive: true });
      const response = await create(seller.token, { prescription_id: prescriptionId, ...BODY });
      expect(response.status).toBe(409);
      expect(response.body.message).toBe('No se puede vender a un paciente inactivo.');
    });

    it('la receta puede tener varias órdenes (por ejemplo, unos lentes de repuesto)', async () => {
      const { prescriptionId } = await scene();
      expect((await create(seller.token, { prescription_id: prescriptionId, ...BODY })).status).toBe(201);
      expect((await create(seller.token, { prescription_id: prescriptionId, ...BODY })).status).toBe(201);
    });
  });
});

// -----------------------------------------------------------------------------
describe('ver las órdenes', () => {
  it('la lista trae solo las de mis sucursales, la más reciente primero, con paginación', async () => {
    const solo = await actor('encargado_venta', [central.id]);
    const other = await actor('encargado_venta', [escalon.id]);
    const first = await created(solo.token);
    const second = await created(solo.token);
    const { prescriptionId } = await scene();
    const foreign = (await create(other.token, { prescription_id: prescriptionId, ...BODY })).body.data.id as string;

    const response = await list(solo.token, '?page_size=100');
    expect(response.status).toBe(200);
    const ids = response.body.data.map((row: { id: string }) => row.id);
    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);
    expect(ids).not.toContain(foreign);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
    expect(response.body.pagination).toMatchObject({ page: 1, page_size: 100, total: ids.length });
    for (const row of response.body.data) expect(row.branch_id).toBe(central.id);
  });

  it('el administrador ve las de todas las sucursales', async () => {
    const other = await actor('encargado_venta', [escalon.id]);
    const { prescriptionId } = await scene();
    const foreign = (await create(other.token, { prescription_id: prescriptionId, ...BODY })).body.data.id as string;
    const admin = await actor('admin');
    const ids = (await list(admin.token, '?page_size=100')).body.data.map((row: { id: string }) => row.id);
    expect(ids).toContain(foreign);
  });

  it('filtra por estado y por paciente', async () => {
    const first = await created();
    await change(seller.token, first.id, { status: 'in_lab' });
    const second = await created();

    const byStatus = (await list(seller.token, '?status=in_lab&page_size=100')).body.data;
    expect(byStatus.map((row: { id: string }) => row.id)).toContain(first.id);
    expect(byStatus.map((row: { id: string }) => row.id)).not.toContain(second.id);
    for (const row of byStatus) expect(row.status).toBe('in_lab');

    const byPatient = (await list(seller.token, `?patient_id=${second.patient.id}`)).body.data;
    expect(byPatient.map((row: { id: string }) => row.id)).toEqual([second.id]);
  });

  it('filtra por una de mis sucursales; una ajena es 403', async () => {
    const wide = await actor('encargado_venta', [central.id, escalon.id]);
    const { prescriptionId } = await scene();
    const inEscalon = (await create(wide.token, { prescription_id: prescriptionId, ...BODY }, { 'X-Sucursal-Id': escalon.id })).body.data.id;
    const rows = (await list(wide.token, `?branch_id=${escalon.id}&page_size=100`)).body.data;
    expect(rows.map((row: { id: string }) => row.id)).toContain(inEscalon);
    for (const row of rows) expect(row.branch_id).toBe(escalon.id);

    expect((await list(seller.token, `?branch_id=${escalon.id}`)).status).toBe(403);
  });

  it('pagina: la página 2 trae otras filas que la 1', async () => {
    // Una sucursal propia para que el total no dependa de las demás pruebas.
    const own = await createTestBranch();
    const solo = await actor('encargado_venta', [own.id]);
    for (let i = 0; i < 3; i += 1) {
      const { prescriptionId } = await scene();
      expect((await create(solo.token, { prescription_id: prescriptionId, ...BODY })).status).toBe(201);
    }
    const one = (await list(solo.token, '?page_size=2&page=1')).body;
    const two = (await list(solo.token, '?page_size=2&page=2')).body;
    expect(one.data).toHaveLength(2);
    expect(two.data).toHaveLength(1);
    expect(one.pagination).toMatchObject({ total: 3, total_pages: 2 });
    expect(one.data.map((r: { id: string }) => r.id)).not.toContain(two.data[0].id);
  });

  it.each(['?status=otro', '?patient_id=x', '?page=0', '?page_size=101', '?branch_id=x'])('filtros inválidos %s: 400', async (query) => {
    expect((await list(seller.token, query)).status).toBe(400);
  });

  it('una orden por id trae su historia; una inexistente es 404; un id mal escrito es 400', async () => {
    const { id } = await created();
    const response = await get(seller.token, id);
    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(id);
    expect(response.body.data.events).toHaveLength(1);
    expect((await get(seller.token, UUID_THAT_DOES_NOT_EXIST)).status).toBe(404);
    expect((await get(seller.token, 'no-es-uuid')).status).toBe(400);
  });

  it('una orden de otra sucursal es 404, igual que una que no existe', async () => {
    const other = await actor('encargado_venta', [escalon.id]);
    const { id } = await created();
    const response = await get(other.token, id);
    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Orden no encontrada.');
  });

  it('avisa si la receta fue reemplazada después de la venta', async () => {
    const { id, prescriptionId, patient } = await created();
    expect((await get(seller.token, id)).body.data.prescription_is_current).toBe(true);
    const recordId = (await pool.query('SELECT record_id FROM prescriptions WHERE id = $1', [prescriptionId])).rows[0].record_id;
    await insertPrescription({ patientId: patient.id, doctorId: doctor.id, branchId: central.id, recordId, supersedesId: prescriptionId });
    expect((await get(seller.token, id)).body.data.prescription_is_current).toBe(false);
  });
});

// -----------------------------------------------------------------------------
describe('avanzar una orden', () => {
  it('recorre pendiente -> en taller -> lista -> entregada y deja la historia completa', async () => {
    const { id } = await created();
    for (const status of ['in_lab', 'ready', 'delivered']) {
      const response = await change(seller.token, id, { status });
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe(status);
    }
    const detail = (await get(seller.token, id)).body.data;
    expect(detail.events.map((e: { from_status: string | null; to_status: string }) => [e.from_status, e.to_status])).toEqual([
      [null, 'pending'], ['pending', 'in_lab'], ['in_lab', 'ready'], ['ready', 'delivered'],
    ]);
    for (const event of detail.events) expect(event.changed_by).toBe(seller.id);
  });

  it('cada cambio queda en la bitácora con el estado anterior y el nuevo', async () => {
    const { id, patient } = await created();
    await change(seller.token, id, { status: 'in_lab' });
    const [row] = await auditRows('optical_order_status_changed', id);
    expect(row).toMatchObject({ entity_type: 'optical_order', actor_id: seller.id, branch_id: central.id });
    expect(row.detail).toEqual({ patient_id: patient.id, from: 'pending', to: 'in_lab' });
  });

  it.each(['pending', 'in_lab', 'ready'] as const)('se cancela desde %s con un motivo, que se guarda y queda en la bitácora', async (from) => {
    const { id } = await created();
    if (from !== 'pending') await change(seller.token, id, { status: 'in_lab' });
    if (from === 'ready') await change(seller.token, id, { status: 'ready' });
    const response = await change(seller.token, id, { status: 'cancelled', reason: '  Cambió de opinión  ' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'cancelled', cancellation_reason: 'Cambió de opinión' });
    const rows = await auditRows('optical_order_status_changed', id);
    expect(rows[rows.length - 1].detail).toMatchObject({ to: 'cancelled', reason: 'Cambió de opinión' });
  });

  it.each([
    ['pending', 'ready', 'pendiente', 'lista'],
    ['pending', 'delivered', 'pendiente', 'entregada'],
    ['in_lab', 'delivered', 'en taller', 'entregada'],
  ])('no se puede saltar pasos: %s -> %s es 409', async (from, to, fromLabel, toLabel) => {
    const { id } = await created();
    if (from === 'in_lab') await change(seller.token, id, { status: 'in_lab' });
    const response = await change(seller.token, id, { status: to });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe(`Una orden ${fromLabel} no puede pasar a ${toLabel}.`);
  });

  it('no se retrocede ni se repite el estado', async () => {
    const { id } = await created();
    await change(seller.token, id, { status: 'in_lab' });
    expect((await change(seller.token, id, { status: 'in_lab' })).status).toBe(409);
    await change(seller.token, id, { status: 'ready' });
    expect((await change(seller.token, id, { status: 'in_lab' })).status).toBe(409);
  });

  it('una orden entregada no se cancela ni cambia', async () => {
    const { id } = await created();
    for (const status of ['in_lab', 'ready', 'delivered']) await change(seller.token, id, { status });
    const response = await change(seller.token, id, { status: 'cancelled', reason: 'Tarde' });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Una orden entregada no puede pasar a cancelada.');
  });

  it('una orden cancelada no se reabre', async () => {
    const { id } = await created();
    await change(seller.token, id, { status: 'cancelled', reason: 'Duplicada' });
    const response = await change(seller.token, id, { status: 'in_lab' });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Una orden cancelada no puede pasar a en taller.');
  });

  it('un 409 no deja rastro: ni evento ni bitácora', async () => {
    const { id } = await created();
    await change(seller.token, id, { status: 'delivered' });
    expect((await get(seller.token, id)).body.data.events).toHaveLength(1);
    expect(await auditRows('optical_order_status_changed', id)).toHaveLength(0);
  });

  describe('validaciones del cuerpo (400)', () => {
    it.each([
      ['sin estado', {}, 'status'],
      ['estado desconocido', { status: 'enviada' }, 'status'],
      ['volver a pendiente', { status: 'pending' }, 'status'],
      ['cancelar sin motivo', { status: 'cancelled' }, 'reason'],
      ['cancelar con motivo en blanco', { status: 'cancelled', reason: '   ' }, 'reason'],
      ['motivo muy largo', { status: 'cancelled', reason: 'a'.repeat(201) }, 'reason'],
      ['motivo en un avance', { status: 'in_lab', reason: 'por algo' }, 'reason'],
    ])('%s', async (_name, body, field) => {
      const { id } = await created();
      const response = await change(seller.token, id, body);
      expect(response.status).toBe(400);
      expect(response.body.errors.map((e: { field: string }) => e.field)).toContain(field);
    });

    it('un motivo vacío al avanzar se acepta como ausente', async () => {
      const { id } = await created();
      expect((await change(seller.token, id, { status: 'in_lab', reason: '' })).status).toBe(200);
    });
  });

  it('una orden que no existe es 404; un id mal escrito es 400', async () => {
    expect((await change(seller.token, UUID_THAT_DOES_NOT_EXIST, { status: 'in_lab' })).status).toBe(404);
    expect((await change(seller.token, 'no-es-uuid', { status: 'in_lab' })).status).toBe(400);
  });

  it('una orden de otra sucursal es 404 y no cambia', async () => {
    const other = await actor('encargado_venta', [escalon.id]);
    const { id } = await created();
    expect((await change(other.token, id, { status: 'in_lab' })).status).toBe(404);
    expect((await get(seller.token, id)).body.data.status).toBe('pending');
  });

  it('quien avanza queda en la historia con SU sucursal activa', async () => {
    const wide = await actor('encargado_venta', [central.id, escalon.id]);
    const { id } = await created(wide.token);
    await change(wide.token, id, { status: 'in_lab' }, { 'X-Sucursal-Id': escalon.id });
    const [row] = await auditRows('optical_order_status_changed', id);
    expect(row.branch_id).toBe(escalon.id);
    const events = (await pool.query('SELECT branch_id FROM optical_order_events WHERE order_id = $1 ORDER BY created_at, id', [id])).rows;
    expect(events.map((e) => e.branch_id)).toEqual([central.id, escalon.id]);
  });

  it('dos avances simultáneos: uno gana y el otro recibe 409; la historia queda con un solo paso', async () => {
    const { id } = await created();
    const [a, b] = await Promise.all([
      change(seller.token, id, { status: 'in_lab' }),
      change(seller.token, id, { status: 'in_lab' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await get(seller.token, id)).body.data.events).toHaveLength(2);
  });

  it('cancelar y avanzar a la vez: la orden queda en un estado válido y la historia coincide', async () => {
    const { id } = await created();
    const [advance, cancel] = await Promise.all([
      change(seller.token, id, { status: 'in_lab' }),
      change(seller.token, id, { status: 'cancelled', reason: 'Se arrepintió' }),
    ]);
    // Si la cancelación llegó primero, avanzar es 409; si llegó después, ambas se aplican.
    expect(cancel.status).toBe(200);
    expect([200, 409]).toContain(advance.status);
    const final = (await get(seller.token, id)).body.data;
    expect(final.status).toBe('cancelled');
    expect(final.events).toHaveLength(advance.status === 200 ? 3 : 2);
  });
});
