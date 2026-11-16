// =============================================================================
// consentimientos.ts (modelo)
// Qué hace:     consultas SQL de los consentimientos: listarlos, registrar uno,
//               revocarlo y saber si un paciente tiene uno vigente.
// Requerimiento: consentimiento del paciente para que la óptica vea su receta.
// Depende de:   configuracion/baseDatos.ts y de la tabla consents (migración 08).
// Lo usa:       servicios/consentimientos.ts.
//
// Solo SQL: quién puede hacer qué lo decide el servicio. El estado (vigente o
// revocado) no se guarda: se deduce de revoked_at.
// =============================================================================
import { pool } from '../configuracion/baseDatos';

export type ConsentStatus = 'active' | 'revoked';

export interface Consent {
  id: string;
  patient_id: string;
  granted_by: string;
  granted_by_name: string;
  note: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_by_name: string | null;
  status: ConsentStatus;
}

const CONSENT_SELECT = `
  SELECT c.id, c.patient_id, c.granted_by, g.full_name AS granted_by_name, c.note,
         c.created_at, c.revoked_at, c.revoked_by, r.full_name AS revoked_by_name,
         CASE WHEN c.revoked_at IS NULL THEN 'active' ELSE 'revoked' END AS status
    FROM consents c
    JOIN users g ON g.id = c.granted_by
    LEFT JOIN users r ON r.id = c.revoked_by`;

// Todos los consentimientos de un paciente, el más reciente primero.
export async function listConsents(patientId: string): Promise<Consent[]> {
  const result = await pool.query<Consent>(
    `${CONSENT_SELECT} WHERE c.patient_id = $1 ORDER BY c.created_at DESC, c.id DESC`,
    [patientId],
  );
  return result.rows;
}

// Busca un consentimiento por id. Devuelve null si no existe.
export async function findConsent(id: string): Promise<Consent | null> {
  const result = await pool.query<Consent>(`${CONSENT_SELECT} WHERE c.id = $1`, [id]);
  return result.rows[0] ?? null;
}

// ¿El paciente tiene un consentimiento vigente? Es la pregunta que hacen las
// recetas y las órdenes de óptica.
export async function hasActiveConsent(patientId: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM consents WHERE patient_id = $1 AND revoked_at IS NULL',
    [patientId],
  );
  return (result.rowCount ?? 0) > 0;
}

// Registra un consentimiento. Devuelve su id. Si el paciente ya tiene uno
// vigente, PostgreSQL lanza el error 23505 (índice uq_consents_vigente) y el
// servicio lo traduce a un 409.
export async function insertConsent(data: {
  patientId: string;
  grantedBy: string;
  note: string | null;
}): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO consents (patient_id, granted_by, note) VALUES ($1, $2, $3) RETURNING id`,
    [data.patientId, data.grantedBy, data.note],
  );
  return result.rows[0].id;
}

// Revoca un consentimiento vigente. La condición "revoked_at IS NULL" está en
// el propio UPDATE para que dos revocaciones simultáneas no se pisen.
// Devuelve true si lo revocó, false si ya estaba revocado.
export async function revokeConsent(id: string, revokedBy: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE consents
        SET revoked_at = (now() AT TIME ZONE 'America/El_Salvador'), revoked_by = $2
      WHERE id = $1 AND revoked_at IS NULL`,
    [id, revokedBy],
  );
  return (result.rowCount ?? 0) > 0;
}
