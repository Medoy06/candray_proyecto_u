// =============================================================================
// expedientes.ts (modelo)
// Qué hace:     consultas SQL del expediente clínico: leer el historial de un
//               paciente, agregar una nota o una enmienda, y las dos consultas
//               que responden "¿este médico tiene relación con este paciente?".
// Requerimiento: RF-01, RF-08 y RB-03 (sección 7 del documento de diseño).
// Depende de:   configuracion/baseDatos.ts y de las tablas medical_records,
//               referrals y appointments (migraciones 05, 06 y 07).
// Lo usan:      servicios/expedientes.ts y servicios/accesoPaciente.ts.
//
// Solo SQL: quién puede hacer qué lo decide el servicio. La tabla es de solo
// agregar (migración 06), por eso aquí no existe ningún UPDATE ni DELETE.
// =============================================================================
import { pool } from '../configuracion/baseDatos';

// Una nota del expediente, con el nombre del médico y de la sucursal ya unidos.
export interface RecordEntry {
  id: string;
  patient_id: string;
  doctor_id: string;
  doctor_name: string;
  branch_id: string;
  branch_name: string;
  appointment_id: string | null;       // nulo en una enmienda
  appointment_starts_at: string | null; // 'AAAA-MM-DD HH:MM:SS'; nulo en una enmienda
  amends_id: string | null;            // la nota que corrige; nulo en una nota original
  diagnosis: string;
  treatment: string | null;
  notes: string | null;
  created_at: string;
  amendment_count: number;             // cuántas enmiendas tiene esta nota
}

const RECORD_SELECT = `
  SELECT m.id, m.patient_id, m.doctor_id, u.full_name AS doctor_name,
         m.branch_id, b.name AS branch_name,
         m.appointment_id, a.starts_at AS appointment_starts_at, m.amends_id,
         m.diagnosis, m.treatment, m.notes, m.created_at,
         (SELECT count(*)::int FROM medical_records x WHERE x.amends_id = m.id) AS amendment_count
    FROM medical_records m
    JOIN users u    ON u.id = m.doctor_id
    JOIN branches b ON b.id = m.branch_id
    LEFT JOIN appointments a ON a.id = m.appointment_id`;

// Historial de un paciente, de lo más reciente a lo más antiguo, con paginación.
// Recibe: id del paciente, página (desde 1) y tamaño de página.
// Devuelve: las notas de la página y el total de notas del paciente.
export async function listRecords(
  patientId: string,
  page: number,
  pageSize: number,
): Promise<{ rows: RecordEntry[]; total: number }> {
  const [rows, count] = await Promise.all([
    pool.query<RecordEntry>(
      `${RECORD_SELECT}
        WHERE m.patient_id = $1
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT $2 OFFSET $3`,
      [patientId, pageSize, (page - 1) * pageSize],
    ),
    pool.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM medical_records WHERE patient_id = $1',
      [patientId],
    ),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

// Busca una nota por id. Devuelve null si no existe.
export async function findRecord(id: string): Promise<RecordEntry | null> {
  const result = await pool.query<RecordEntry>(`${RECORD_SELECT} WHERE m.id = $1`, [id]);
  return result.rows[0] ?? null;
}

// Datos para agregar una nota o una enmienda. Exactamente una de las dos
// referencias (appointmentId o amendsId) debe venir con valor; la base lo exige.
export interface NewRecord {
  patientId: string;
  doctorId: string;
  branchId: string;
  appointmentId: string | null;
  amendsId: string | null;
  diagnosis: string;
  treatment: string | null;
  notes: string | null;
}

// Agrega una nota. Devuelve su id.
// Lanza 23505 si la consulta ya tiene su nota (índice uq_medical_records_una_nota_por_cita).
export async function insertRecord(data: NewRecord): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO medical_records
       (patient_id, doctor_id, branch_id, appointment_id, amends_id, diagnosis, treatment, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      data.patientId, data.doctorId, data.branchId, data.appointmentId,
      data.amendsId, data.diagnosis, data.treatment, data.notes,
    ],
  );
  return result.rows[0].id;
}

// ¿El médico tiene alguna cita (no cancelada, pasada o futura) con el paciente?
export async function doctorHasAppointmentWith(doctorId: string, patientId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM appointments
      WHERE doctor_id = $1 AND patient_id = $2 AND status <> 'cancelled'
      LIMIT 1`,
    [doctorId, patientId],
  );
  return result.rows.length > 0;
}

// Interconsulta vigente del médico para el paciente: no revocada y sin vencer.
// Si hay varias, devuelve la que vence más tarde. Devuelve null si no hay.
export async function findActiveReferral(
  doctorId: string,
  patientId: string,
): Promise<{ id: string; expires_at: string } | null> {
  const result = await pool.query<{ id: string; expires_at: string }>(
    `SELECT id, expires_at FROM referrals
      WHERE provider_id = $1 AND patient_id = $2
        AND revoked_at IS NULL
        AND expires_at > (now() AT TIME ZONE 'America/El_Salvador')
      ORDER BY expires_at DESC
      LIMIT 1`,
    [doctorId, patientId],
  );
  return result.rows[0] ?? null;
}
