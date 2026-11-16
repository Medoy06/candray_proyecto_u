// =============================================================================
// interconsultas.ts (servicio)
// Qué hace:     las llamadas a la API de interconsultas (el acceso temporal que
//               un médico le da a otro sobre el expediente de un paciente) y los
//               tipos de sus datos.
// Depende de:   servicios/clienteApi.ts.
// Lo usan:      ganchos/useInterconsultas.ts y paginas/expediente/*.
// Requiere:     referrals_manage; además el servidor exige haber atendido al
//               paciente. No hay llamada para borrar: una interconsulta se revoca
//               y queda el registro.
// Las horas llegan como texto ya en hora de El Salvador ("AAAA-MM-DD HH:MM:SS").
// =============================================================================
import { api } from './clienteApi';

export type ReferralStatus = 'active' | 'expired' | 'revoked';

export interface Referral {
  id: string;
  patient_id: string;
  provider_id: string;      // el médico que recibe el acceso
  provider_name: string;
  granted_by: string;       // el médico que lo dio
  granted_by_name: string;
  reason: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  status: ReferralStatus;   // lo calcula el servidor con la hora de El Salvador
}

// Un médico al que se le puede dar una interconsulta.
export interface ReferralCandidate {
  id: string;
  full_name: string;
}

// Lo que se envía al dar una interconsulta.
export interface GrantReferralInput {
  provider_id: string;
  reason: string;
  days: number;
}

// GET /api/pacientes/:id/interconsultas — todas, vigentes, vencidas y revocadas.
export async function listReferrals(patientId: string): Promise<Referral[]> {
  const response = await api.get<{ data: Referral[] }>(`/pacientes/${patientId}/interconsultas`);
  return response.data.data;
}

// GET /api/pacientes/:id/interconsultas/candidatos — médicos a quienes se les puede dar una.
export async function listReferralCandidates(patientId: string): Promise<ReferralCandidate[]> {
  const response = await api.get<{ data: ReferralCandidate[] }>(`/pacientes/${patientId}/interconsultas/candidatos`);
  return response.data.data;
}

// POST /api/pacientes/:id/interconsultas — da una interconsulta.
export async function grantReferral(patientId: string, input: GrantReferralInput): Promise<Referral> {
  const response = await api.post<{ data: Referral }>(`/pacientes/${patientId}/interconsultas`, input);
  return response.data.data;
}

// POST /api/pacientes/:id/interconsultas/:id/revocar — la revoca. Lanza 409 si ya no estaba vigente.
export async function revokeReferral(patientId: string, referralId: string): Promise<Referral> {
  const response = await api.post<{ data: Referral }>(`/pacientes/${patientId}/interconsultas/${referralId}/revocar`);
  return response.data.data;
}
