// =============================================================================
// citas.ts (modelo)
// Qué hace:     consultas SQL de las citas: listar la agenda con filtros y
//               paginación, leer una, crear, reprogramar y cambiar su estado; y
//               buscar los bloques de atención de un médico en un día.
// Requerimiento: capacidades appointments_read y appointments_manage (sección 7).
// Depende de:   configuracion/baseDatos.ts y de las migraciones 03, 04 y 05.
// Lo usa:       servicios/citas.ts.
//
// Las citas nunca se borran: se cancelan (status = 'cancelled'). Que un médico
// o un paciente no tenga dos citas a la vez lo garantiza la base de datos
// (restricciones de exclusión de la migración 05); aquí solo se inserta.
// =============================================================================
import type { PoolClient } from 'pg';
import { pool } from '../configuracion/baseDatos';
import type { ListAppointmentsQuery } from '../esquemas/citas';

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

// Una cita con los nombres que la pantalla necesita mostrar.
export interface Appointment {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_record_number: number;
  patient_phone: string;
  doctor_id: string;
  doctor_name: string;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  starts_at: string;   // 'AAAA-MM-DD HH:MM:SS' (hora de El Salvador)
  ends_at: string;
  status: AppointmentStatus;
  reason: string | null;
  cancellation_reason: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

// Datos que se escriben al crear una cita.
export interface NewAppointment {
  patient_id: string;
  doctor_id: string;
  branch_id: string;
  date: string;          // 'AAAA-MM-DD'
  time: string;          // 'HH:MM'
  reason: string | null;
  created_by: string;
}

// Datos que cambian al reprogramar.
export interface AppointmentSlot {
  doctor_id: string;
  branch_id: string;
  date: string;
  time: string;
  reason: string | null;
}

const APPOINTMENT_SELECT = `
  SELECT a.id, a.patient_id, p.full_name AS patient_name,
         p.record_number AS patient_record_number, p.phone AS patient_phone,
         a.doctor_id, d.full_name AS doctor_name,
         a.branch_id, b.code AS branch_code, b.name AS branch_name,
         a.starts_at, a.ends_at, a.status::text AS status, a.reason, a.cancellation_reason,
         a.created_by, c.full_name AS created_by_name, a.created_at, a.updated_at
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN users d    ON d.id = a.doctor_id
    JOIN branches b ON b.id = a.branch_id
    JOIN users c    ON c.id = a.created_by`;

// Condiciones comunes de la lista y del conteo. Cada filtro vacío (null) se ignora.
//   $1 = sucursales permitidas   $2 = médico        $3 = paciente
//   $4 = estado                  $5 = sucursal      $6 = desde (fecha)   $7 = hasta (fecha, inclusive)
const WHERE = `
  WHERE a.branch_id = ANY($1::uuid[])
    AND ($2::uuid IS NULL OR a.doctor_id = $2)
    AND ($3::uuid IS NULL OR a.patient_id = $3)
    AND ($4::text IS NULL OR a.status::text = $4)
    AND ($5::uuid IS NULL OR a.branch_id = $5)
    AND ($6::date IS NULL OR a.starts_at >= $6::date)
    AND ($7::date IS NULL OR a.starts_at < $7::date + 1)`;

// Convierte los filtros validados en los parámetros de WHERE. `date` es lo
// mismo que un rango de un solo día. `forcedDoctorId` (el médico que consulta)
// manda sobre el filtro de médico del cliente.
function filterParams(
  query: ListAppointmentsQuery,
  allowedBranchIds: string[],
  forcedDoctorId: string | null,
): unknown[] {
  return [
    allowedBranchIds,
    forcedDoctorId ?? query.doctor_id ?? null,
    query.patient_id ?? null,
    query.status ?? null,
    query.branch_id ?? null,
    query.date ?? query.from ?? null,
    query.date ?? query.to ?? null,
  ];
}

// Devuelve una página de la agenda (por fecha y hora) y el total.
export async function listAppointments(
  query: ListAppointmentsQuery,
  allowedBranchIds: string[],
  forcedDoctorId: string | null,
): Promise<{ rows: Appointment[]; total: number }> {
  const params = filterParams(query, allowedBranchIds, forcedDoctorId);
  const [rows, count] = await Promise.all([
    pool.query<Appointment>(
      `${APPOINTMENT_SELECT} ${WHERE}
        ORDER BY a.starts_at, a.id
        LIMIT $8 OFFSET $9`,
      [...params, query.page_size, (query.page - 1) * query.page_size],
    ),
    pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM appointments a ${WHERE}`, params),
  ]);
  return { rows: rows.rows, total: count.rows[0].n };
}

// Busca una cita por id. Devuelve null si no existe.
// Si recibe `tx`, bloquea la fila (FOR UPDATE) hasta terminar la transacción.
export async function findAppointment(id: string, tx?: PoolClient): Promise<Appointment | null> {
  const db = tx ?? pool;
  const result = await db.query<Appointment>(
    `${APPOINTMENT_SELECT} WHERE a.id = $1 ${tx ? 'FOR UPDATE OF a' : ''}`,
    [id],
  );
  return result.rows[0] ?? null;
}

// Inserta una cita (de 30 minutos, agendada). Devuelve su id.
// Lanza 23P01 si el médico o el paciente ya tienen una cita a esa hora.
export async function insertAppointment(data: NewAppointment): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO appointments
       (patient_id, doctor_id, branch_id, starts_at, ends_at, reason, created_by)
     VALUES ($1, $2, $3, ($4::text || ' ' || $5::text)::timestamp, ($4::text || ' ' || $5::text)::timestamp + interval '30 minutes', $6, $7)
     RETURNING id`,
    [data.patient_id, data.doctor_id, data.branch_id, data.date, data.time, data.reason, data.created_by],
  );
  return result.rows[0].id;
}

// Reescribe médico, sucursal, hora y motivo de una cita (reprogramar).
export async function updateAppointmentSlot(tx: PoolClient, id: string, data: AppointmentSlot): Promise<void> {
  await tx.query(
    `UPDATE appointments
        SET doctor_id = $2, branch_id = $3,
            starts_at = ($4::text || ' ' || $5::text)::timestamp,
            ends_at = ($4::text || ' ' || $5::text)::timestamp + interval '30 minutes',
            reason = $6
      WHERE id = $1`,
    [id, data.doctor_id, data.branch_id, data.date, data.time, data.reason],
  );
}

// Cambia el estado de una cita (y el motivo, si se cancela).
export async function updateAppointmentStatus(
  tx: PoolClient,
  id: string,
  status: AppointmentStatus,
  cancellationReason: string | null,
): Promise<void> {
  await tx.query(
    `UPDATE appointments SET status = $2::appointment_status, cancellation_reason = $3 WHERE id = $1`,
    [id, status, cancellationReason],
  );
}

// Bloques de atención de un médico, en una sucursal y un día de la semana.
export async function listDoctorBlocks(
  doctorId: string,
  branchId: string,
  weekday: number,
): Promise<{ start_time: string; end_time: string }[]> {
  const result = await pool.query<{ start_time: string; end_time: string }>(
    `SELECT start_time, end_time FROM doctor_schedules
      WHERE doctor_id = $1 AND branch_id = $2 AND weekday = $3`,
    [doctorId, branchId, weekday],
  );
  return result.rows;
}
