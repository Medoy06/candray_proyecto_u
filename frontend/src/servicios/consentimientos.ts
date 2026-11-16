// =============================================================================
// consentimientos.ts (servicio)
// Qué hace:     las llamadas a la API de consentimientos (la autorización del
//               paciente para que la óptica vea su receta) y los tipos de sus
//               datos.
// Depende de:   servicios/clienteApi.ts.
// Lo usan:      ganchos/useConsentimientos.ts y paginas/pacientes/*.
// Requiere:     consents_manage (médicos y recepción). No hay llamada para borrar:
//               un consentimiento se revoca y queda el registro.
// Las horas llegan como texto ya en hora de El Salvador ("AAAA-MM-DD HH:MM:SS").
// =============================================================================
import { api } from './clienteApi';

export type ConsentStatus = 'active' | 'revoked';

export interface Consent {
  id: string;
  patient_id: string;
  granted_by: string;            // quién lo registró
  granted_by_name: string;
  note: string | null;           // cómo se obtuvo (opcional)
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_by_name: string | null;
  status: ConsentStatus;
}

// GET /api/pacientes/:id/consentimientos — el historial, el más reciente primero.
export async function listConsents(patientId: string): Promise<Consent[]> {
  const response = await api.get<{ data: Consent[] }>(`/pacientes/${patientId}/consentimientos`);
  return response.data.data;
}

// POST /api/pacientes/:id/consentimientos — registra uno nuevo. La nota, si es
// un texto vacío, se manda como null.
export async function grantConsent(patientId: string, note: string): Promise<Consent> {
  const trimmed = note.trim();
  const response = await api.post<{ data: Consent }>(`/pacientes/${patientId}/consentimientos`, {
    note: trimmed === '' ? null : trimmed,
  });
  return response.data.data;
}

// POST /api/pacientes/:id/consentimientos/:consentId/revocar
export async function revokeConsent(patientId: string, consentId: string): Promise<Consent> {
  const response = await api.post<{ data: Consent }>(`/pacientes/${patientId}/consentimientos/${consentId}/revocar`);
  return response.data.data;
}
