// =============================================================================
// interconsultas.ts (modelo)
// Qué hace:     consultas SQL de las interconsultas: listarlas, darlas,
//               revocarlas y buscar a qué médicos se les puede dar una.
// Requerimiento: interconsulta (acceso temporal entre médicos), sección 7.
// Depende de:   configuracion/baseDatos.ts y de la tabla referrals (migración 07).
// Lo usa:       servicios/interconsultas.ts.
//
// Solo SQL: quién puede hacer qué lo decide el servicio. El estado de una
// interconsulta (vigente, vencida o revocada) no se guarda: se calcula al
// consultarla, con la hora de El Salvador, para que "vencida" nunca dependa de
// que alguien actualice una columna.
// =============================================================================
import { pool } from '../configuracion/baseDatos';

export type ReferralStatus = 'active' | 'expired' | 'revoked';

export interface Referral {
  id: string;
  patient_id: string;
  provider_id: string;
  provider_name: string;
  granted_by: string;
  granted_by_name: string;
  reason: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  status: ReferralStatus;
}

const REFERRAL_SELECT = `
  SELECT r.id, r.patient_id, r.provider_id, p.full_name AS provider_name,
         r.granted_by, g.full_name AS granted_by_name, r.reason,
         r.created_at, r.expires_at, r.revoked_at, r.revoked_by,
         CASE WHEN r.revoked_at IS NOT NULL THEN 'revoked'
              WHEN r.expires_at <= (now() AT TIME ZONE 'America/El_Salvador') THEN 'expired'
              ELSE 'active' END AS status
    FROM referrals r
    JOIN users p ON p.id = r.provider_id
    JOIN users g ON g.id = r.granted_by`;

// Todas las interconsultas de un paciente, la más reciente primero.
export async function listReferrals(patientId: string): Promise<Referral[]> {
  const result = await pool.query<Referral>(
    `${REFERRAL_SELECT} WHERE r.patient_id = $1 ORDER BY r.created_at DESC, r.id DESC`,
    [patientId],
  );
  return result.rows;
}

// Busca una interconsulta por id. Devuelve null si no existe.
export async function findReferral(id: string): Promise<Referral | null> {
  const result = await pool.query<Referral>(`${REFERRAL_SELECT} WHERE r.id = $1`, [id]);
  return result.rows[0] ?? null;
}

// Da una interconsulta que vence dentro de `days` días a partir de ahora.
// Devuelve su id.
export async function insertReferral(data: {
  patientId: string;
  providerId: string;
  grantedBy: string;
  reason: string;
  days: number;
}): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO referrals (patient_id, provider_id, granted_by, reason, expires_at)
     VALUES ($1, $2, $3, $4, (now() AT TIME ZONE 'America/El_Salvador') + make_interval(days => $5))
     RETURNING id`,
    [data.patientId, data.providerId, data.grantedBy, data.reason, data.days],
  );
  return result.rows[0].id;
}

// Revoca una interconsulta que sigue vigente. La condición "revoked_at IS NULL"
// está en el propio UPDATE para que dos revocaciones simultáneas no se pisen.
// Devuelve true si la revocó, false si ya no estaba vigente.
export async function revokeReferral(id: string, revokedBy: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE referrals
        SET revoked_at = (now() AT TIME ZONE 'America/El_Salvador'), revoked_by = $2
      WHERE id = $1 AND revoked_at IS NULL
        AND expires_at > (now() AT TIME ZONE 'America/El_Salvador')`,
    [id, revokedBy],
  );
  return (result.rowCount ?? 0) > 0;
}

// Médicos activos a los que se les puede dar una interconsulta sobre un
// paciente: no es quien la da, no atiende ya al paciente y no tiene ya una
// interconsulta vigente sobre él.
export async function listReferralCandidates(
  patientId: string,
  grantedBy: string,
): Promise<{ id: string; full_name: string }[]> {
  const result = await pool.query<{ id: string; full_name: string }>(
    `SELECT u.id, u.full_name
       FROM users u
      WHERE u.role = 'doctor' AND u.is_active = true AND u.id <> $2
        AND NOT EXISTS (SELECT 1 FROM appointments a
                         WHERE a.doctor_id = u.id AND a.patient_id = $1 AND a.status <> 'cancelled')
        AND NOT EXISTS (SELECT 1 FROM referrals r
                         WHERE r.provider_id = u.id AND r.patient_id = $1 AND r.revoked_at IS NULL
                           AND r.expires_at > (now() AT TIME ZONE 'America/El_Salvador'))
      ORDER BY u.full_name, u.id`,
    [patientId, grantedBy],
  );
  return result.rows;
}
