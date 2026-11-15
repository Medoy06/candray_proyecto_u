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

  it('una segunda siembra sobre la misma base se rechaza', async () => {
    await expect(seedDemo()).rejects.toThrow('usuarios de demostración');
  });
});
