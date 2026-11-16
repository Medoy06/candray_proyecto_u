// =============================================================================
// demostracion.prueba.ts
// Qué prueba:   que la semilla de demostración deja un sistema utilizable:
//               cada usuario inicia sesión con la contraseña de demostración y
//               ve exactamente las sucursales que le corresponden.
// Cómo:         siembra la base de pruebas una vez y llama al login por HTTP.
// Depende de:   base_datos/semillas/demostracion.ts y app.ts.
// =============================================================================
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, DEMO_USERS, seedDemo } from '../../../base_datos/semillas/demostracion';
import { DEMO_PATIENTS } from '../../../base_datos/semillas/demostracionClinica';
import { pool } from '../../src/configuracion/baseDatos';
import { createApp } from '../../src/app';

const app = createApp();

// Códigos de las sucursales de la semilla (la base de pruebas puede tener otras
// sucursales creadas por otras pruebas; solo se comparan las de la semilla).
const SEED_CODES = ['CENTRAL', 'ESCALON', 'METROSUR'];

const login = (email: string) =>
  request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });

describe('Semilla de demostración', () => {
  let summary: Awaited<ReturnType<typeof seedDemo>>;

  beforeAll(async () => {
    summary = await seedDemo();
  });

  it('crea un usuario por cada rol', () => {
    const roles = new Set(DEMO_USERS.map((user) => user.role));
    expect(roles).toEqual(new Set(['admin', 'doctor', 'recepcionista', 'encargado_venta', 'directivo']));
  });

  it.each(DEMO_USERS)('$email inicia sesión como $role', async (demoUser) => {
    const response = await login(demoUser.email);
    expect(response.status).toBe(200);
    expect(response.body.data.user.role).toBe(demoUser.role);
  });

  // El administrador y el directivo se excluyen: ven TODAS las sucursales activas,
  // tengan o no asignaciones (se prueban aparte, más abajo).
  it.each(DEMO_USERS.filter((user) => user.role !== 'admin' && user.role !== 'directivo'))(
    '$email ve exactamente sus sucursales, con la predeterminada primero',
    async (demoUser) => {
      const response = await login(demoUser.email);
      const codes = response.body.data.branches
        .map((branch: { code: string }) => branch.code)
        .filter((code: string) => SEED_CODES.includes(code));
      expect(codes).toEqual(demoUser.branchCodes);
    },
  );

  it('el médico itinerante trabaja en Central y Escalón, y entra por Central', async () => {
    const response = await login('dr.mejia@candray.test');
    const codes = response.body.data.branches.map((branch: { code: string }) => branch.code);
    expect(codes).toEqual(['CENTRAL', 'ESCALON']);
    expect(response.body.data.branches[0].id).toBe(response.body.data.activeBranchId);
  });

  it('el directivo y el administrador ven las sucursales activas, nunca la inactiva', async () => {
    for (const email of ['directivo@candray.test', 'admin@candray.test']) {
      const response = await login(email);
      const codes = response.body.data.branches.map((branch: { code: string }) => branch.code);
      expect(codes).toContain('CENTRAL');
      expect(codes).toContain('ESCALON');
      expect(codes).not.toContain('METROSUR');
    }
  });

  it('las sucursales piloto traen sus datos reales y su color de la paleta de Candray', async () => {
    const response = await login('dr.mejia@candray.test');
    const [central, escalon] = response.body.data.branches;
    expect(central).toMatchObject({ code: 'CENTRAL', phone: '2233-6500', theme_color: '#003449' });
    expect(central.address).toContain('15 Calle Poniente');
    expect(escalon).toMatchObject({ code: 'ESCALON', phone: '2233-6565', theme_color: '#276876' });
    expect(escalon.address).toContain('Escalón');
    expect(central.opening_time).toBe('08:00:00');
    expect(central.closing_time).toBe('18:00:00');
  });

  it('cada sucursal activa trae su color y su dato de óptica', async () => {
    const response = await login('dr.mejia@candray.test');
    const central = response.body.data.branches.find((b: { code: string }) => b.code === 'CENTRAL');
    const escalon = response.body.data.branches.find((b: { code: string }) => b.code === 'ESCALON');
    expect(central.theme_color).not.toBe(escalon.theme_color);
    expect(central.has_optical_counter).toBe(true);
  });

  // Los datos clínicos se consultan por los correos de la semilla, porque la base
  // de pruebas también tiene datos creados por otras pruebas.
  describe('datos clínicos', () => {
    const demoDoctors = `(SELECT id FROM users WHERE email LIKE '%@candray.test' AND role = 'doctor')`;

    it('crea pacientes, horarios y citas', () => {
      expect(summary.clinical.patients).toBe(10);
      expect(summary.clinical.schedules).toBeGreaterThan(0);
      expect(summary.clinical.appointments).toBeGreaterThan(0);
    });

    it('cada médico de la semilla tiene horario, y el itinerante atiende en dos sucursales', async () => {
      const result = await pool.query<{ email: string; branches: number }>(
        `SELECT u.email, count(DISTINCT s.branch_id)::int AS branches
           FROM doctor_schedules s JOIN users u ON u.id = s.doctor_id
          WHERE u.email LIKE '%@candray.test'
          GROUP BY u.email`,
      );
      const byEmail = Object.fromEntries(result.rows.map((row) => [row.email, row.branches]));
      expect(byEmail).toEqual({
        'dr.mejia@candray.test': 2,
        'dra.rivas@candray.test': 1,
        'dr.portillo@candray.test': 1,
      });
    });

    it('hay citas pasadas y próximas, y de todos los estados', async () => {
      const result = await pool.query<{ past: number; upcoming: number; statuses: string[] }>(
        `SELECT count(*) FILTER (WHERE starts_at < now() AT TIME ZONE 'America/El_Salvador' - interval '1 day')::int AS past,
                count(*) FILTER (WHERE starts_at >= (now() AT TIME ZONE 'America/El_Salvador')::date)::int AS upcoming,
                array_agg(DISTINCT status::text ORDER BY status::text) AS statuses
           FROM appointments WHERE doctor_id IN ${demoDoctors}`,
      );
      expect(result.rows[0].past).toBeGreaterThan(0);
      expect(result.rows[0].upcoming).toBeGreaterThan(0);
      expect(result.rows[0].statuses).toEqual(['cancelled', 'completed', 'no_show', 'scheduled']);
    });

    it('las citas caen siempre en días hábiles, dentro del horario del médico en esa sucursal', async () => {
      const outside = await pool.query(
        `SELECT a.id
           FROM appointments a
          WHERE a.doctor_id IN ${demoDoctors}
            AND NOT EXISTS (
              SELECT 1 FROM doctor_schedules s
               WHERE s.doctor_id = a.doctor_id AND s.branch_id = a.branch_id
                 AND s.weekday = extract(isodow FROM a.starts_at)
                 AND a.starts_at::time >= s.start_time AND a.ends_at::time <= s.end_time)`,
      );
      expect(outside.rows).toEqual([]);
    });

    it('las citas canceladas traen su motivo y las demás no', async () => {
      const result = await pool.query<{ ok: boolean }>(
        `SELECT bool_and((status = 'cancelled') = (cancellation_reason IS NOT NULL)) AS ok
           FROM appointments WHERE doctor_id IN ${demoDoctors}`,
      );
      expect(result.rows[0].ok).toBe(true);
    });
  });

  describe('expediente e interconsulta', () => {
    const demoDoctors = `(SELECT id FROM users WHERE email LIKE '%@candray.test' AND role = 'doctor')`;

    it('cada cita atendida tiene su nota original, y solo esas', async () => {
      const result = await pool.query<{ attended: number; with_note: number; notes_on_other: number }>(
        `SELECT count(*) FILTER (WHERE a.status = 'completed')::int AS attended,
                count(*) FILTER (WHERE a.status = 'completed' AND m.id IS NOT NULL)::int AS with_note,
                count(*) FILTER (WHERE a.status <> 'completed' AND m.id IS NOT NULL)::int AS notes_on_other
           FROM appointments a LEFT JOIN medical_records m ON m.appointment_id = a.id
          WHERE a.doctor_id IN ${demoDoctors}`,
      );
      expect(result.rows[0].attended).toBeGreaterThan(0);
      expect(result.rows[0].with_note).toBe(result.rows[0].attended);
      expect(result.rows[0].notes_on_other).toBe(0);
    });

    it('hay una enmienda de ejemplo y el resumen cuenta todas las notas', async () => {
      const result = await pool.query<{ amendments: number; total: number }>(
        `SELECT count(*) FILTER (WHERE amends_id IS NOT NULL)::int AS amendments, count(*)::int AS total
           FROM medical_records WHERE doctor_id IN ${demoDoctors}`,
      );
      expect(result.rows[0].amendments).toBe(1);
      expect(result.rows[0].total).toBe(summary.clinical.medicalRecords);
    });

    it('la interconsulta de ejemplo es a un paciente que el médico receptor aún no atiende, y está vigente', async () => {
      expect(summary.clinical.referrals).toBe(1);
      const result = await pool.query<{ attended_by_provider: number; active: boolean }>(
        `SELECT (SELECT count(*)::int FROM appointments a
                  WHERE a.patient_id = r.patient_id AND a.doctor_id = r.provider_id AND a.status <> 'cancelled')
                  AS attended_by_provider,
                (r.expires_at > now() AT TIME ZONE 'America/El_Salvador' AND r.revoked_at IS NULL) AS active
           FROM referrals r WHERE r.granted_by IN ${demoDoctors}`,
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ attended_by_provider: 0, active: true });
    });
  });

  // La óptica se prueba por la API, como la vería quien usa el sistema.
  describe('óptica: consentimientos, recetas y órdenes', () => {
    // Inicia sesión y devuelve el token de acceso.
    const tokenOf = async (email: string): Promise<string> => (await login(email)).body.data.token as string;
    const nameOf = (index: number) => DEMO_PATIENTS[index].full_name;

    // Estado de cada orden de la lista, por nombre de paciente.
    const statusByPatient = async (email: string): Promise<Record<string, string>> => {
      const response = await request(app)
        .get('/api/ordenes-optica?page_size=50')
        .set('Authorization', `Bearer ${await tokenOf(email)}`);
      expect(response.status).toBe(200);
      return Object.fromEntries(
        response.body.data.map((order: { patient_name: string; status: string }) => [order.patient_name, order.status]),
      );
    };

    it('el resumen cuenta cinco casos, con un consentimiento revocado y una receta reemplazada', () => {
      expect(summary.optical).toEqual({ consents: 5, revokedConsents: 1, prescriptions: 6, orders: 5 });
    });

    it('la óptica de Central ve sus cuatro órdenes y la de Escalón ve la suya, cada una en su estado', async () => {
      const central = await statusByPatient('optica.central@candray.test');
      expect(central).toEqual({
        [nameOf(0)]: 'pending',
        [nameOf(1)]: 'in_lab',
        [nameOf(2)]: 'delivered',
        [nameOf(4)]: 'ready',
      });
      expect(await statusByPatient('optica.escalon@candray.test')).toEqual({ [nameOf(3)]: 'cancelled' });
    });

    it('solo la orden cuya receta fue reemplazada lo avisa', async () => {
      const response = await request(app)
        .get('/api/ordenes-optica?page_size=50')
        .set('Authorization', `Bearer ${await tokenOf('optica.central@candray.test')}`);
      const outdated = response.body.data
        .filter((order: { prescription_is_current: boolean }) => !order.prescription_is_current)
        .map((order: { patient_name: string }) => order.patient_name);
      expect(outdated).toEqual([nameOf(0)]);
    });

    it('la orden entregada trae su historia completa, en orden y empezando sin estado anterior', async () => {
      const token = await tokenOf('optica.central@candray.test');
      const list = await request(app).get('/api/ordenes-optica?status=delivered').set('Authorization', `Bearer ${token}`);
      const detail = await request(app).get(`/api/ordenes-optica/${list.body.data[0].id}`).set('Authorization', `Bearer ${token}`);
      expect(detail.body.data.events.map((event: { from_status: string | null; to_status: string }) => [event.from_status, event.to_status]))
        .toEqual([[null, 'pending'], ['pending', 'in_lab'], ['in_lab', 'ready'], ['ready', 'delivered']]);
    });

    it('la orden cancelada trae su motivo', async () => {
      const token = await tokenOf('optica.escalon@candray.test');
      const list = await request(app).get('/api/ordenes-optica?status=cancelled').set('Authorization', `Bearer ${token}`);
      expect(list.body.data[0].cancellation_reason).toBe('El paciente prefirió otro armazón');
    });

    it('con consentimiento vigente la óptica lee solo la receta vigente; con el consentimiento revocado, nada', async () => {
      const token = await tokenOf('optica.central@candray.test');
      const ids = summary.clinical.patientIds;
      const granted = await request(app).get(`/api/pacientes/${ids[0]}/recetas`).set('Authorization', `Bearer ${token}`);
      expect(granted.status).toBe(200);
      expect(granted.body.access).toBe('consent');
      // El primer paciente tiene dos recetas (la original y su reemplazo): la óptica solo ve la vigente.
      expect(granted.body.data).toHaveLength(1);
      expect(granted.body.data[0].lens_notes).toBe('Graduación corregida en el control');

      const revoked = await request(app).get(`/api/pacientes/${ids[4]}/recetas`).set('Authorization', `Bearer ${token}`);
      expect(revoked.status).toBe(403);
    });

    it('cada orden termina con el mismo estado que su último evento y el anticipo no pasa del total', async () => {
      const result = await pool.query<{ bad: number }>(
        `SELECT count(*)::int AS bad
           FROM optical_orders o
          WHERE o.created_by IN (SELECT id FROM users WHERE email LIKE 'optica.%@candray.test')
            AND (o.status IS DISTINCT FROM (SELECT e.to_status FROM optical_order_events e
                                             WHERE e.order_id = o.id ORDER BY e.created_at DESC, e.id DESC LIMIT 1)
                 OR o.deposit_amount > o.total_amount)`,
      );
      expect(result.rows[0].bad).toBe(0);
    });
  });

  it('una segunda siembra sobre la misma base se rechaza', async () => {
    await expect(seedDemo()).rejects.toThrow('usuarios de demostración');
  });
});
