// =============================================================================
// panel.prueba.ts
// Qué prueba:   el panel de indicadores (GET /api/panel): quién puede verlo,
//               que cuente bien las citas de hoy y de la semana y las órdenes
//               de óptica de cada sucursal, que sume los totales, que ignore
//               las sucursales inactivas y que NO devuelva datos de pacientes.
// Cómo:         llama a la API real (supertest) sobre la base candray_test.
//               Cada prueba usa una sucursal propia y se fija solo en ella.
// Depende de:   app.ts, servicios/panel.ts y las ayudas de prueba.
// =============================================================================
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import type { Role } from '../../src/configuracion/roles';
import { sumIndicators } from '../../src/servicios/panel';
import { todayInElSalvador } from '../../src/utilidades/fechas';
import { signToken } from '../../src/utilidades/token';
import {
  createTestPatient, insertAppointment, insertMedicalRecord, insertOpticalOrder, insertPrescription,
} from '../ayudas/datosClinicos';
import { createTestBranch, createTestUser, type TestBranch } from '../ayudas/datosPrueba';

const app = createApp();

async function actor(role: Role, branchIds: string[] = []) {
  const user = await createTestUser({ role, branchIds });
  return { ...user, token: signToken({ userId: user.id, email: user.email, role }) };
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// Suma días a una fecha 'AAAA-MM-DD' (en UTC, sin zona horaria del equipo).
function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

const TODAY = todayInElSalvador();

// El panel tal como lo ve un directivo, y la fila de una sucursal dentro de él.
async function panelOf(token: string) {
  const response = await request(app).get('/api/panel').set(auth(token));
  expect(response.status).toBe(200);
  return response.body.data as {
    as_of: string;
    totals: Record<string, unknown>;
    branches: Array<Record<string, any>>;
  };
}
const rowOf = (panel: Awaited<ReturnType<typeof panelOf>>, branch: TestBranch) =>
  panel.branches.find((item) => item.branch_id === branch.id)!;

describe('permisos', () => {
  it('sin sesión: 401', async () => {
    expect((await request(app).get('/api/panel')).status).toBe(401);
  });

  it.each(['doctor', 'recepcionista', 'encargado_venta'] as const)('%s no ve el panel: 403', async (role) => {
    const branch = await createTestBranch();
    const user = await actor(role, [branch.id]);
    expect((await request(app).get('/api/panel').set(auth(user.token))).status).toBe(403);
  });

  it.each(['directivo', 'admin'] as const)('%s sí lo ve', async (role) => {
    const user = await actor(role, role === 'admin' ? [(await createTestBranch()).id] : []);
    const panel = await panelOf(user.token);
    expect(panel.as_of).toBe(TODAY);
  });
});

describe('los números de una sucursal', () => {
  let branch: TestBranch;
  let empty: TestBranch;
  let inactive: TestBranch;
  let director: Awaited<ReturnType<typeof actor>>;
  let patientName: string;
  let patientPhone: string;

  beforeAll(async () => {
    branch = await createTestBranch();
    empty = await createTestBranch();
    inactive = await createTestBranch(false);
    director = await actor('directivo');
    const doctor = await actor('doctor', [branch.id]);
    const seller = await actor('encargado_venta', [branch.id]);

    patientName = `Paciente Secreto ${Date.now()}`;
    patientPhone = '7999-1234';
    const patient = await createTestPatient({ full_name: patientName, phone: patientPhone });
    let hour = 7;
    const appointment = (day: string, status: 'scheduled' | 'completed' | 'no_show' | 'cancelled', where = branch) => {
      hour += 1; // cada cita en su hora: el médico no puede tener dos a la vez
      return insertAppointment({
        patientId: patient.id, doctorId: doctor.id, branchId: where.id, createdBy: seller.id,
        startsAt: `${day} ${String(hour).padStart(2, '0')}:00`, status,
        cancellationReason: status === 'cancelled' ? 'Motivo' : null,
      });
    };

    // Hoy: 2 agendadas, 1 atendida, 1 ausente, 1 cancelada.
    await appointment(TODAY, 'scheduled');
    await appointment(TODAY, 'scheduled');
    await appointment(TODAY, 'completed');
    await appointment(TODAY, 'no_show');
    await appointment(TODAY, 'cancelled');
    // Próximos 7 días: cuentan las agendadas de mañana y del día 7; no el día 8,
    // ni ayer, ni una cancelada.
    await appointment(addDays(TODAY, 1), 'scheduled');
    await appointment(addDays(TODAY, 7), 'scheduled');
    await appointment(addDays(TODAY, 8), 'scheduled');
    await appointment(addDays(TODAY, -1), 'scheduled');
    await appointment(addDays(TODAY, 2), 'cancelled');

    // Una cita en otra sucursal no debe sumarse a esta.
    const otherDoctor = await actor('doctor', [empty.id]);
    await insertAppointment({
      patientId: (await createTestPatient()).id, doctorId: otherDoctor.id, branchId: empty.id, createdBy: seller.id,
      startsAt: `${TODAY} 09:00`, status: 'scheduled',
    });


    // Órdenes: una receta por orden (cada orden nace de una receta).
    const order = async (status: string, total: number, updatedAt?: string) => {
      hour += 1;
      const consultation = (
        await insertAppointment({
          patientId: patient.id, doctorId: doctor.id, branchId: branch.id, createdBy: seller.id,
          startsAt: `${addDays(TODAY, -300 - hour)} 08:00`, status: 'completed',
        })
      ).rows[0].id;
      const record = (
        await insertMedicalRecord({ patientId: patient.id, doctorId: doctor.id, branchId: branch.id, appointmentId: consultation, diagnosis: 'x' })
      ).rows[0].id;
      const prescription = (
        await insertPrescription({ patientId: patient.id, doctorId: doctor.id, branchId: branch.id, recordId: record })
      ).rows[0].id;
      await insertOpticalOrder({
        patientId: patient.id, prescriptionId: prescription, branchId: branch.id, createdBy: seller.id,
        columns: {
          status, total_amount: total, deposit_amount: 0,
          cancellation_reason: status === 'cancelled' ? 'Motivo' : null,
          ...(updatedAt ? { updated_at: updatedAt } : {}),
        },
      });
    };
    await order('pending', 100);
    await order('in_lab', 100);
    await order('ready', 100);
    await order('ready', 100);
    await order('delivered', 120, `${addDays(TODAY, -1)} 10:00:00`);
    await order('delivered', 80.5, `${addDays(TODAY, -29)} 10:00:00`); // hace 29 días es el día 30: entra
    await order('delivered', 999, `${addDays(TODAY, -30)} 10:00:00`);  // hace 30 días ya es el día 31: no entra
    await order('cancelled', 500);
  });

  it('cuenta las citas de hoy por estado', async () => {
    const row = rowOf(await panelOf(director.token), branch);
    expect(row.appointments_today).toEqual({ scheduled: 2, completed: 1, no_show: 1, cancelled: 1 });
  });

  it('cuenta las citas agendadas de los próximos 7 días (sin hoy, sin ayer, sin canceladas)', async () => {
    expect(rowOf(await panelOf(director.token), branch).appointments_next_7_days).toBe(2);
  });

  it('cuenta las órdenes abiertas por estado, sin las entregadas ni las canceladas', async () => {
    expect(rowOf(await panelOf(director.token), branch).orders_open).toEqual({ pending: 1, in_lab: 1, ready: 2 });
  });

  it('las ventas son solo las entregadas en los últimos 30 días, y suman con centavos', async () => {
    const row = rowOf(await panelOf(director.token), branch);
    expect(row.delivered_last_30_days).toBe(2);
    expect(row.sales_last_30_days).toBe(200.5);
  });

  it('cada sucursal cuenta lo suyo: la otra solo tiene su cita de hoy', async () => {
    const row = rowOf(await panelOf(director.token), empty);
    expect(row.appointments_today.scheduled).toBe(1);
    expect(row.orders_open).toEqual({ pending: 0, in_lab: 0, ready: 0 });
    expect(row.sales_last_30_days).toBe(0);
  });

  it('una sucursal inactiva no aparece', async () => {
    const panel = await panelOf(director.token);
    expect(panel.branches.some((item) => item.branch_id === inactive.id)).toBe(false);
  });

  it('los totales son la suma de las sucursales que se muestran', async () => {
    const panel = await panelOf(director.token);
    expect(panel.totals).toEqual(sumIndicators(panel.branches as never));
  });

  it('las sucursales vienen ordenadas por nombre', async () => {
    const names = (await panelOf(director.token)).branches.map((item) => item.branch_name as string);
    expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it('no devuelve datos de pacientes: ni nombre, ni teléfono', async () => {
    const response = await request(app).get('/api/panel').set(auth(director.token));
    const text = JSON.stringify(response.body);
    expect(text).not.toContain(patientName);
    expect(text).not.toContain(patientPhone);
    expect(text).not.toContain('patient');
  });
});

describe('sumIndicators', () => {
  const one = {
    appointments_today: { scheduled: 1, completed: 2, no_show: 3, cancelled: 4 },
    appointments_next_7_days: 5,
    orders_open: { pending: 6, in_lab: 7, ready: 8 },
    delivered_last_30_days: 9,
    sales_last_30_days: 0.1,
  };

  it('con una lista vacía devuelve ceros', () => {
    expect(sumIndicators([])).toEqual({
      appointments_today: { scheduled: 0, completed: 0, no_show: 0, cancelled: 0 },
      appointments_next_7_days: 0,
      orders_open: { pending: 0, in_lab: 0, ready: 0 },
      delivered_last_30_days: 0,
      sales_last_30_days: 0,
    });
  });

  it('suma cada número por separado', () => {
    expect(sumIndicators([one, one])).toEqual({
      appointments_today: { scheduled: 2, completed: 4, no_show: 6, cancelled: 8 },
      appointments_next_7_days: 10,
      orders_open: { pending: 12, in_lab: 14, ready: 16 },
      delivered_last_30_days: 18,
      sales_last_30_days: 0.2,
    });
  });

  it('no arrastra errores de decimales al sumar dinero (0.1 + 0.2 = 0.3)', () => {
    expect(sumIndicators([{ ...one, sales_last_30_days: 0.1 }, { ...one, sales_last_30_days: 0.2 }]).sales_last_30_days).toBe(0.3);
  });
});

