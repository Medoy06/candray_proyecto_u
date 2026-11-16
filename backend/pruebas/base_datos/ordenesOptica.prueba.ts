// =============================================================================
// ordenesOptica.prueba.ts
// Qué prueba:   las reglas de las tablas optical_orders y optical_order_events
//               (migración 10): campos obligatorios, dinero válido, el motivo de
//               cancelación, que solo cambie el estado y por caminos permitidos,
//               que nada se borre y que la historia no se reescriba.
// Cómo:         inserta con SQL sobre la base de pruebas y comprueba el código
//               de error de PostgreSQL cuando una regla se rompe.
// =============================================================================
import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/configuracion/baseDatos';
import { createTestBranch, createTestUser, type TestBranch, type TestUser } from '../ayudas/datosPrueba';
import {
  createTestPatient, insertAppointment, insertMedicalRecord, insertOpticalOrder, insertPrescription,
} from '../ayudas/datosClinicos';

const CHECK_VIOLATION = '23514';
const NOT_NULL_VIOLATION = '23502';
const FOREIGN_KEY_VIOLATION = '23503';
const INSUFFICIENT_PRIVILEGE = '42501';
const INVALID_ENUM = '22P02';

let branch: TestBranch;
let doctor: TestUser;
let seller: TestUser;
let dayCounter = 0;

beforeAll(async () => {
  branch = await createTestBranch();
  doctor = await createTestUser({ role: 'doctor', branchIds: [branch.id] });
  seller = await createTestUser({ role: 'encargado_venta', branchIds: [branch.id] });
});

// Un paciente con una receta emitida por el médico.
async function scene() {
  const patient = await createTestPatient();
  dayCounter += 1;
  const day = new Date(Date.UTC(2020, 0, 1 + dayCounter)).toISOString().slice(0, 10);
  const appointmentId = (
    await insertAppointment({
      patientId: patient.id, doctorId: doctor.id, branchId: branch.id, createdBy: seller.id, startsAt: `${day} 08:00`,
    })
  ).rows[0].id;
  const recordId = (
    await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: branch.id, appointmentId })
  ).rows[0].id;
  const prescriptionId = (
    await insertPrescription({ patientId: patient.id, doctorId: doctor.id, branchId: branch.id, recordId })
  ).rows[0].id;
  return { patient, prescriptionId };
}

async function order(columns: Record<string, unknown> = {}) {
  const { patient, prescriptionId } = await scene();
  return insertOpticalOrder({
    patientId: patient.id, prescriptionId, branchId: branch.id, createdBy: seller.id, columns,
  });
}
const stored = async (id: string) => (await pool.query('SELECT * FROM optical_orders WHERE id = $1', [id])).rows[0];
const setStatus = (id: string, status: string, reason: string | null = null) =>
  pool.query('UPDATE optical_orders SET status = $2, cancellation_reason = $3 WHERE id = $1', [id, status, reason]);

describe('optical_orders — datos', () => {
  it('guarda la orden pendiente, con su receta, sucursal, quién la registró y las horas', async () => {
    const { patient, prescriptionId } = await scene();
    const id = (
      await insertOpticalOrder({ patientId: patient.id, prescriptionId, branchId: branch.id, createdBy: seller.id, columns: { notes: 'Entrega urgente' } })
    ).rows[0].id;
    const row = await stored(id);
    expect(row).toMatchObject({
      patient_id: patient.id, prescription_id: prescriptionId, branch_id: branch.id, created_by: seller.id,
      frame_description: 'Armazón metálico negro', lens_description: 'Lentes con antirreflejo',
      total_amount: '120.00', deposit_amount: '40.00', notes: 'Entrega urgente', status: 'pending', cancellation_reason: null,
    });
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });

  it('el anticipo vale 0 si no se indica y puede ser igual al total', async () => {
    const { patient, prescriptionId } = await scene();
    await pool.query(
      `INSERT INTO optical_orders (patient_id, prescription_id, branch_id, created_by, frame_description, lens_description, total_amount)
       VALUES ($1, $2, $3, $4, 'a', 'b', 50)`,
      [patient.id, prescriptionId, branch.id, seller.id],
    );
    expect((await pool.query('SELECT deposit_amount FROM optical_orders WHERE patient_id = $1', [patient.id])).rows[0].deposit_amount).toBe('0.00');
    await expect(order({ total_amount: 50, deposit_amount: 50 })).resolves.toBeDefined();
  });

  it.each([
    ['total en cero', { total_amount: 0 }],
    ['total negativo', { total_amount: -5 }],
    ['anticipo negativo', { deposit_amount: -1 }],
    ['anticipo mayor que el total', { total_amount: 50, deposit_amount: 50.01 }],
    ['armazón de solo espacios', { frame_description: '   ' }],
    ['lentes de solo espacios', { lens_description: ' ' }],
    ['nota de solo espacios', { notes: '  ' }],
  ])('rechaza %s', async (_name, columns) => {
    await expect(order(columns)).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it.each(['frame_description', 'lens_description', 'total_amount', 'prescription_id', 'branch_id', 'created_by'])(
    'exige %s',
    async (column) => {
      await expect(order({ [column]: null })).rejects.toMatchObject({ code: NOT_NULL_VIOLATION });
    },
  );

  it('la receta, la sucursal y quien la registra deben existir', async () => {
    const missing = '00000000-0000-0000-0000-000000000000';
    for (const column of ['prescription_id', 'branch_id', 'created_by', 'patient_id']) {
      await expect(order({ [column]: missing })).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    }
  });

  it('el motivo de cancelación existe si y solo si la orden está cancelada', async () => {
    await expect(order({ status: 'cancelled' })).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(order({ cancellation_reason: 'Cambió de opinión' })).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(order({ status: 'cancelled', cancellation_reason: '  ' })).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('no acepta un estado que no existe', async () => {
    await expect(order({ status: 'shipped' })).rejects.toMatchObject({ code: INVALID_ENUM });
  });
});

describe('optical_orders — cambios de estado', () => {
  it.each([
    ['pending', 'in_lab'],
    ['in_lab', 'ready'],
    ['ready', 'delivered'],
  ])('permite pasar de %s a %s', async (from, to) => {
    const id = (await order({ status: from })).rows[0].id;
    await setStatus(id, to);
    expect((await stored(id)).status).toBe(to);
  });

  it.each(['pending', 'in_lab', 'ready'])('permite cancelar desde %s, con motivo', async (from) => {
    const id = (await order({ status: from })).rows[0].id;
    await setStatus(id, 'cancelled', 'Cambió de opinión');
    expect(await stored(id)).toMatchObject({ status: 'cancelled', cancellation_reason: 'Cambió de opinión' });
  });

  it.each([
    ['pending', 'ready'],
    ['pending', 'delivered'],
    ['in_lab', 'pending'],
    ['in_lab', 'delivered'],
    ['ready', 'in_lab'],
    ['ready', 'pending'],
    ['pending', 'pending'],
  ])('no permite pasar de %s a %s', async (from, to) => {
    const id = (await order({ status: from })).rows[0].id;
    await expect(setStatus(id, to)).rejects.toMatchObject({ code: CHECK_VIOLATION });
    expect((await stored(id)).status).toBe(from);
  });

  it.each(['in_lab', 'ready', 'pending'])('una orden entregada no cambia (a %s)', async (to) => {
    const id = (await order({ status: 'delivered' })).rows[0].id;
    await expect(setStatus(id, to)).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('una orden cancelada no se reabre', async () => {
    const id = (await order({ status: 'cancelled', cancellation_reason: 'Duplicada' })).rows[0].id;
    await expect(setStatus(id, 'pending')).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('cada cambio de estado actualiza updated_at', async () => {
    const id = (await order()).rows[0].id;
    const before = (await stored(id)).updated_at;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await setStatus(id, 'in_lab');
    const after = (await stored(id)).updated_at;
    expect(after > before).toBe(true);
  });

  it.each([
    ['el total', 'total_amount = 1'],
    ['el anticipo', 'deposit_amount = 1'],
    ['el armazón', `frame_description = 'otro'`],
    ['los lentes', `lens_description = 'otros'`],
    ['la nota', `notes = 'otra'`],
    ['quién la registró', `created_by = '${'00000000-0000-0000-0000-000000000000'}'`],
  ])('no deja cambiar %s', async (_name, assignment) => {
    const id = (await order()).rows[0].id;
    await expect(pool.query(`UPDATE optical_orders SET ${assignment} WHERE id = $1`, [id])).rejects.toBeDefined();
  });

  it('no deja cambiar la receta ni el paciente de una orden', async () => {
    const id = (await order()).rows[0].id;
    const other = await scene();
    await expect(pool.query('UPDATE optical_orders SET prescription_id = $2 WHERE id = $1', [id, other.prescriptionId])).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    await expect(pool.query('UPDATE optical_orders SET patient_id = $2 WHERE id = $1', [id, other.patient.id])).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });
});

describe('optical_orders — no se borra', () => {
  it('rechaza borrar una orden', async () => {
    const id = (await order()).rows[0].id;
    await expect(pool.query('DELETE FROM optical_orders WHERE id = $1', [id])).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    expect(await stored(id)).toBeDefined();
  });

  it('rechaza vaciar la tabla, también en cascada', async () => {
    await expect(pool.query('TRUNCATE optical_orders CASCADE')).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });
});

describe('optical_order_events — la historia no se reescribe', () => {
  async function event() {
    const id = (await order()).rows[0].id;
    const result = await pool.query(
      `INSERT INTO optical_order_events (order_id, from_status, to_status, changed_by, branch_id)
       VALUES ($1, NULL, 'pending', $2, $3) RETURNING id`,
      [id, seller.id, branch.id],
    );
    return result.rows[0].id as string;
  }

  it('guarda el cambio con quién, dónde y cuándo; el primero no tiene estado anterior', async () => {
    const id = await event();
    const row = (await pool.query('SELECT * FROM optical_order_events WHERE id = $1', [id])).rows[0];
    expect(row).toMatchObject({ from_status: null, to_status: 'pending', changed_by: seller.id, branch_id: branch.id });
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });

  it('rechaza editar, borrar y vaciar', async () => {
    const id = await event();
    for (const sql of [
      `UPDATE optical_order_events SET to_status = 'ready' WHERE id = '${id}'`,
      `DELETE FROM optical_order_events WHERE id = '${id}'`,
      'TRUNCATE optical_order_events',
    ]) {
      await expect(pool.query(sql)).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    }
  });

  it('exige una orden que exista', async () => {
    await expect(
      pool.query(
        `INSERT INTO optical_order_events (order_id, to_status, changed_by, branch_id) VALUES ($1, 'pending', $2, $3)`,
        ['00000000-0000-0000-0000-000000000000', seller.id, branch.id],
      ),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });
});
