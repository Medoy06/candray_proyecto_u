// =============================================================================
// pacientes.ts (modelo)
// Qué hace:     consultas SQL de los pacientes: buscar con paginación, leer uno,
//               crear y modificar.
// Requerimiento: capacidades patients_search y patients_manage (sección 7).
// Depende de:   configuracion/baseDatos.ts y de la tabla patients (migración 03).
// Lo usa:       servicios/pacientes.ts.
//
// Los pacientes pertenecen a toda la cadena, no a una sucursal: se buscan en
// todas. Nunca se borran: se desactivan (is_active = false).
// =============================================================================
import type { PoolClient } from 'pg';
import { pool } from '../configuracion/baseDatos';
import type { SearchPatientsQuery } from '../esquemas/pacientes';

export interface Patient {
  id: string;
  record_number: number;
  full_name: string;
  birth_date: string;   // 'AAAA-MM-DD'
  phone: string;
  dui: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Campos que se pueden escribir en un paciente.
export interface PatientFields {
  full_name: string;
  birth_date: string;
  phone: string;
  dui: string | null;
  email: string | null;
  is_active: boolean;
}

const PATIENT_COLUMNS = `p.id, p.record_number, p.full_name, p.birth_date, p.phone,
                         p.dui, p.email, p.is_active, p.created_at, p.updated_at`;

// Protege un texto para usarlo dentro de un LIKE: sin esto, un "%" o un "_"
// escrito por el usuario funcionaría como comodín.
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

// Condiciones comunes de la lista y del conteo.
//   $1 = incluir inactivos      $2 = palabras del nombre (o null)
//   $3 = texto completo (o null) $4 = número de expediente (o null)
// Un paciente aparece si TODAS las palabras están en su nombre (sin tildes ni
// mayúsculas), o si el texto aparece en su teléfono, empieza su DUI, o es su
// número de expediente. Sin texto, aparecen todos.
const WHERE = `
  WHERE ($1::boolean OR p.is_active)
    AND ($3::text IS NULL OR (
          NOT EXISTS (
            SELECT 1 FROM unnest($2::text[]) AS word
             WHERE unaccent(p.full_name) NOT ILIKE '%' || unaccent(word) || '%')
          OR p.phone ILIKE '%' || $3 || '%'
          OR p.dui ILIKE $3 || '%'
          OR p.record_number = $4::int))`;

// Convierte la búsqueda validada en la lista de parámetros de WHERE.
function searchParams(query: SearchPatientsQuery): unknown[] {
  const text = query.q;
  if (text === undefined) return [query.include_inactive, null, null, null];
  const words = text.split(/\s+/).slice(0, 6).map(escapeLike);
  const recordNumber = /^\d{1,9}$/.test(text) ? Number(text) : null;
  return [query.include_inactive, words, escapeLike(text), recordNumber];
}

// Devuelve una página de pacientes (por nombre) y el total que cumple la búsqueda.
export async function searchPatients(
  query: SearchPatientsQuery,
): Promise<{ rows: Patient[]; total: number }> {
  const params = searchParams(query);
  const [rows, count] = await Promise.all([
    pool.query<Patient>(
      `SELECT ${PATIENT_COLUMNS} FROM patients p ${WHERE}
        ORDER BY p.full_name, p.id
        LIMIT $5 OFFSET $6`,
      [...params, query.page_size, (query.page - 1) * query.page_size],
    ),
    pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM patients p ${WHERE}`, params),
  ]);
  return { rows: rows.rows, total: count.rows[0].n };
}

// Busca un paciente por id. Devuelve null si no existe.
// Si recibe `tx`, bloquea la fila (FOR UPDATE) hasta terminar la transacción.
export async function findPatient(id: string, tx?: PoolClient): Promise<Patient | null> {
  const db = tx ?? pool;
  const result = await db.query<Patient>(
    `SELECT ${PATIENT_COLUMNS} FROM patients p WHERE p.id = $1 ${tx ? 'FOR UPDATE OF p' : ''}`,
    [id],
  );
  return result.rows[0] ?? null;
}

// Inserta un paciente. Devuelve su id. Lanza error 23505 si el DUI ya existe.
export async function insertPatient(fields: PatientFields): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO patients (full_name, birth_date, phone, dui, email, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [fields.full_name, fields.birth_date, fields.phone, fields.dui, fields.email, fields.is_active],
  );
  return result.rows[0].id;
}

// Reescribe los campos de un paciente (el número de expediente no cambia nunca).
export async function updatePatientFields(tx: PoolClient, id: string, fields: PatientFields): Promise<void> {
  await tx.query(
    `UPDATE patients
        SET full_name = $2, birth_date = $3, phone = $4, dui = $5, email = $6, is_active = $7
      WHERE id = $1`,
    [id, fields.full_name, fields.birth_date, fields.phone, fields.dui, fields.email, fields.is_active],
  );
}
