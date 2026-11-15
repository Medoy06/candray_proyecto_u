// =============================================================================
// horarios.ts (modelo)
// Qué hace:     consultas SQL de los bloques del horario semanal de los médicos:
//               listar, leer, crear, modificar y borrar; y contar las citas que
//               quedarían fuera de un bloque que se va a cambiar.
// Requerimiento: capacidades availability_read y schedules_manage (sección 7).
// Depende de:   configuracion/baseDatos.ts y de las tablas de las migraciones
//               04 (doctor_schedules) y 05 (appointments).
// Lo usa:       servicios/horarios.ts y modelos/disponibilidad.ts.
//
// Los bloques SÍ se pueden borrar (no llevan is_active): son configuración, no
// un registro histórico. La bitácora de auditoría guarda quién los cambió.
// =============================================================================
import type { PoolClient } from 'pg';
import { pool } from '../configuracion/baseDatos';
import { TIME_ZONE } from '../configuracion/negocio';
import type { ListSchedulesQuery } from '../esquemas/horarios';

// Hora local de El Salvador como expresión SQL (constante del programa, no del usuario).
const LOCAL_NOW = `(now() AT TIME ZONE '${TIME_ZONE}')`;

// Un bloque con los nombres del médico y la sucursal.
export interface ScheduleBlock {
  id: string;
  doctor_id: string;
  doctor_name: string;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  weekday: number;       // 1 = lunes ... 7 = domingo
  start_time: string;    // 'HH:MM:SS'
  end_time: string;
  created_at: string;
}

// Campos que se pueden escribir en un bloque.
export interface ScheduleFields {
  branch_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

const BLOCK_SELECT = `
  SELECT s.id, s.doctor_id, u.full_name AS doctor_name,
         s.branch_id, b.code AS branch_code, b.name AS branch_name,
         s.weekday, s.start_time, s.end_time, s.created_at
    FROM doctor_schedules s
    JOIN users u    ON u.id = s.doctor_id
    JOIN branches b ON b.id = s.branch_id`;

// Lista bloques. Solo de las sucursales permitidas (allowedBranchIds), y con los
// filtros opcionales por médico y por sucursal. Orden: médico, día y hora.
export async function listSchedules(
  filters: ListSchedulesQuery,
  allowedBranchIds: string[],
): Promise<ScheduleBlock[]> {
  const result = await pool.query<ScheduleBlock>(
    `${BLOCK_SELECT}
      WHERE s.branch_id = ANY($1::uuid[])
        AND ($2::uuid IS NULL OR s.doctor_id = $2)
        AND ($3::uuid IS NULL OR s.branch_id = $3)
      ORDER BY u.full_name, s.weekday, s.start_time`,
    [allowedBranchIds, filters.doctor_id ?? null, filters.branch_id ?? null],
  );
  return result.rows;
}

// Busca un bloque por id. Devuelve null si no existe.
// Si recibe `tx`, bloquea la fila (FOR UPDATE) hasta terminar la transacción.
export async function findSchedule(id: string, tx?: PoolClient): Promise<ScheduleBlock | null> {
  const db = tx ?? pool;
  const result = await db.query<ScheduleBlock>(
    `${BLOCK_SELECT} WHERE s.id = $1 ${tx ? 'FOR UPDATE OF s' : ''}`,
    [id],
  );
  return result.rows[0] ?? null;
}

// Indica si el médico está asignado a la sucursal (tabla user_branches).
export async function isDoctorAssignedToBranch(doctorId: string, branchId: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM user_branches WHERE user_id = $1 AND branch_id = $2',
    [doctorId, branchId],
  );
  return result.rowCount === 1;
}

// Inserta un bloque. Devuelve su id. Lanza 23P01 si se cruza con otro del médico.
export async function insertSchedule(doctorId: string, fields: ScheduleFields): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO doctor_schedules (doctor_id, branch_id, weekday, start_time, end_time)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [doctorId, fields.branch_id, fields.weekday, fields.start_time, fields.end_time],
  );
  return result.rows[0].id;
}

// Reescribe los campos de un bloque (el médico no cambia nunca).
export async function updateScheduleFields(tx: PoolClient, id: string, fields: ScheduleFields): Promise<void> {
  await tx.query(
    `UPDATE doctor_schedules
        SET branch_id = $2, weekday = $3, start_time = $4, end_time = $5
      WHERE id = $1`,
    [id, fields.branch_id, fields.weekday, fields.start_time, fields.end_time],
  );
}

// Borra un bloque.
export async function deleteSchedule(tx: PoolClient, id: string): Promise<void> {
  await tx.query('DELETE FROM doctor_schedules WHERE id = $1', [id]);
}

// Cuenta las citas AGENDADAS y FUTURAS que están dentro del bloque actual y que
// dejarían de estar cubiertas si el bloque pasa a ser `replacement` (o si se
// borra, cuando replacement es null). Una cita sigue cubierta solo si cae dentro
// del bloque nuevo: los demás bloques del médico no pueden cubrirla, porque la
// base impide que dos bloques de un médico se crucen.
export async function countUncoveredAppointments(
  tx: PoolClient,
  current: ScheduleBlock,
  replacement: ScheduleFields | null,
): Promise<number> {
  const result = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM appointments a
      WHERE a.doctor_id = $1
        AND a.branch_id = $2
        AND a.status = 'scheduled'
        AND a.starts_at > ${LOCAL_NOW}
        AND extract(isodow FROM a.starts_at) = $3
        AND a.starts_at::time >= $4 AND a.ends_at::time <= $5
        AND NOT COALESCE(
              a.branch_id = $6::uuid
              AND extract(isodow FROM a.starts_at) = $7::int
              AND a.starts_at::time >= $8::time AND a.ends_at::time <= $9::time,
              false)`,
    [
      current.doctor_id, current.branch_id, current.weekday, current.start_time, current.end_time,
      replacement?.branch_id ?? null, replacement?.weekday ?? null,
      replacement?.start_time ?? null, replacement?.end_time ?? null,
    ],
  );
  return result.rows[0].n;
}
