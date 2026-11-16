// =============================================================================
// recetas.ts (modelo)
// Qué hace:     consultas SQL de las recetas ópticas: listar las de un paciente,
//               buscar una y agregar una nueva.
// Requerimiento: receta óptica (capacidades prescriptions_*).
// Depende de:   configuracion/baseDatos.ts y de la tabla prescriptions
//               (migración 09).
// Lo usa:       servicios/recetas.ts.
//
// Solo SQL: quién puede hacer qué lo decide el servicio. La tabla es de solo
// agregar, por eso aquí no existe ningún UPDATE ni DELETE. Las medidas salen como
// números (::float8), no como texto. "Vigente" no se guarda: una receta es
// vigente si ninguna otra la reemplaza.
// =============================================================================
import { pool } from '../configuracion/baseDatos';

export interface Prescription {
  id: string;
  patient_id: string;
  doctor_id: string;
  doctor_name: string;
  branch_id: string;
  branch_name: string;
  record_id: string;
  supersedes_id: string | null;
  od_sphere: number | null;
  od_cylinder: number | null;
  od_axis: number | null;
  od_addition: number | null;
  oi_sphere: number | null;
  oi_cylinder: number | null;
  oi_axis: number | null;
  oi_addition: number | null;
  pupillary_distance: number | null;
  lens_notes: string | null;
  created_at: string;
  is_current: boolean;
}

const PRESCRIPTION_SELECT = `
  SELECT p.id, p.patient_id, p.doctor_id, u.full_name AS doctor_name,
         p.branch_id, b.name AS branch_name, p.record_id, p.supersedes_id,
         p.od_sphere::float8 AS od_sphere, p.od_cylinder::float8 AS od_cylinder,
         p.od_axis::int AS od_axis, p.od_addition::float8 AS od_addition,
         p.oi_sphere::float8 AS oi_sphere, p.oi_cylinder::float8 AS oi_cylinder,
         p.oi_axis::int AS oi_axis, p.oi_addition::float8 AS oi_addition,
         p.pupillary_distance::float8 AS pupillary_distance, p.lens_notes, p.created_at,
         NOT EXISTS (SELECT 1 FROM prescriptions n WHERE n.supersedes_id = p.id) AS is_current
    FROM prescriptions p
    JOIN users u    ON u.id = p.doctor_id
    JOIN branches b ON b.id = p.branch_id`;

// Recetas de un paciente, la más reciente primero. Con onlyCurrent, solo las
// vigentes (las que nadie ha reemplazado).
export async function listPrescriptions(patientId: string, onlyCurrent: boolean): Promise<Prescription[]> {
  const result = await pool.query<Prescription>(
    `SELECT * FROM (${PRESCRIPTION_SELECT} WHERE p.patient_id = $1) x
      WHERE ($2::boolean = false OR x.is_current)
      ORDER BY x.created_at DESC, x.id DESC`,
    [patientId, onlyCurrent],
  );
  return result.rows;
}

// Busca una receta por id. Devuelve null si no existe.
export async function findPrescription(id: string): Promise<Prescription | null> {
  const result = await pool.query<Prescription>(`${PRESCRIPTION_SELECT} WHERE p.id = $1`, [id]);
  return result.rows[0] ?? null;
}

// Las medidas de una receta (lo que el médico escribe).
export interface PrescriptionMeasures {
  od_sphere: number | null;
  od_cylinder: number | null;
  od_axis: number | null;
  od_addition: number | null;
  oi_sphere: number | null;
  oi_cylinder: number | null;
  oi_axis: number | null;
  oi_addition: number | null;
  pupillary_distance: number | null;
  lens_notes: string | null;
}

// Agrega una receta. Devuelve su id.
// Lanza 23505 si la consulta ya tiene su receta original (uq_prescriptions_una_por_nota)
// o si la receta que se reemplaza ya fue reemplazada (uq_prescriptions_un_reemplazo).
export async function insertPrescription(
  data: PrescriptionMeasures & {
    patientId: string;
    doctorId: string;
    branchId: string;
    recordId: string;
    supersedesId: string | null;
  },
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO prescriptions
       (patient_id, doctor_id, branch_id, record_id, supersedes_id,
        od_sphere, od_cylinder, od_axis, od_addition,
        oi_sphere, oi_cylinder, oi_axis, oi_addition,
        pupillary_distance, lens_notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING id`,
    [
      data.patientId, data.doctorId, data.branchId, data.recordId, data.supersedesId,
      data.od_sphere, data.od_cylinder, data.od_axis, data.od_addition,
      data.oi_sphere, data.oi_cylinder, data.oi_axis, data.oi_addition,
      data.pupillary_distance, data.lens_notes,
    ],
  );
  return result.rows[0].id;
}
