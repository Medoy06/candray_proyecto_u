// =============================================================================
// disponibilidad.ts (modelo)
// Qué hace:     consultas SQL para calcular la disponibilidad: los bloques de
//               atención de un día en una sucursal y las citas que ya ocupan
//               a esos médicos ese día.
// Requerimiento: capacidad availability_read (sección 7 del documento de diseño).
// Depende de:   configuracion/baseDatos.ts y de las migraciones 04 y 05.
// Lo usa:       servicios/disponibilidad.ts.
// =============================================================================
import { pool } from '../configuracion/baseDatos';

// Un bloque de atención de un médico en la sucursal consultada.
export interface DayBlock {
  doctor_id: string;
  doctor_name: string;
  start_time: string; // 'HH:MM:SS'
  end_time: string;
}

// Una cita que ocupa al médico (en cualquier sucursal).
export interface BusyAppointment {
  doctor_id: string;
  starts_at: string; // 'AAAA-MM-DD HH:MM:SS'
  ends_at: string;
}

// Bloques de un día de la semana en una sucursal, solo de médicos activos y
// asignados a esa sucursal. `doctorId` (opcional) limita a un médico.
export async function listDayBlocks(
  branchId: string,
  weekday: number,
  doctorId: string | null,
): Promise<DayBlock[]> {
  const result = await pool.query<DayBlock>(
    `SELECT s.doctor_id, u.full_name AS doctor_name, s.start_time, s.end_time
       FROM doctor_schedules s
       JOIN users u ON u.id = s.doctor_id AND u.is_active AND u.role = 'doctor'
       JOIN user_branches ub ON ub.user_id = s.doctor_id AND ub.branch_id = s.branch_id
      WHERE s.branch_id = $1 AND s.weekday = $2
        AND ($3::uuid IS NULL OR s.doctor_id = $3)
      ORDER BY u.full_name, u.id, s.start_time`,
    [branchId, weekday, doctorId],
  );
  return result.rows;
}

// Citas de esos médicos en una fecha, de CUALQUIER sucursal: un médico no puede
// estar en dos citas a la vez. Las canceladas no cuentan (liberan el horario);
// las atendidas y las ausencias sí ocupan.
export async function listBusyAppointments(doctorIds: string[], date: string): Promise<BusyAppointment[]> {
  if (doctorIds.length === 0) return [];
  const result = await pool.query<BusyAppointment>(
    `SELECT doctor_id, starts_at, ends_at
       FROM appointments
      WHERE doctor_id = ANY($1::uuid[])
        AND status <> 'cancelled'
        AND starts_at >= $2::date AND starts_at < $2::date + 1`,
    [doctorIds, date],
  );
  return result.rows;
}
