// =============================================================================
// recordatorios.ts (modelo)
// Qué hace:     busca las citas próximas a las que habría que recordarles su
//               cita a los pacientes (los recordatorios son SIMULADOS: el
//               sistema no envía mensajes, solo muestra a quién se enviarían).
// Depende de:   configuracion/baseDatos.ts y las tablas de citas, pacientes y usuarios.
// Lo usa:       servicios/recordatorios.ts.
// =============================================================================
import { pool } from '../configuracion/baseDatos';
import { REMINDER_LIMITS } from '../configuracion/negocio';

export interface Reminder {
  appointment_id: string;
  starts_at: string;       // 'AAAA-MM-DD HH:MM:SS', ya en hora de El Salvador
  patient_name: string;
  patient_phone: string;
  doctor_name: string;
  branch_name: string;
}

// Citas agendadas de una sucursal desde AHORA y antes de `until`, de la más
// próxima a la más lejana. Las canceladas, las atendidas y las ausentes no
// llevan recordatorio.
// Recibe: la sucursal, la hora actual ('AAAA-MM-DD HH:MM') y el límite (exclusivo,
// 'AAAA-MM-DD'), los dos en hora de El Salvador.
export async function listUpcomingReminders(branchId: string, now: string, until: string): Promise<Reminder[]> {
  const result = await pool.query<Reminder>(
    `SELECT a.id AS appointment_id, a.starts_at, p.full_name AS patient_name,
            p.phone AS patient_phone, u.full_name AS doctor_name, b.name AS branch_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN users u    ON u.id = a.doctor_id
       JOIN branches b ON b.id = a.branch_id
      WHERE a.branch_id = $1
        AND a.status = 'scheduled'
        AND a.starts_at >= $2::timestamp
        AND a.starts_at < $3::date
      ORDER BY a.starts_at, a.id
      LIMIT $4`,
    [branchId, now, until, REMINDER_LIMITS.maxRows],
  );
  return result.rows;
}
