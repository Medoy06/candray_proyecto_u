// =============================================================================
// consentimientos.ts (servicio)
// Qué hace:     las REGLAS del consentimiento: ver el historial de un paciente,
//               registrar uno, revocarlo y responder si hay uno vigente.
// Requerimiento: capacidades consents_manage y consents_read (sección 7).
// Depende de:   modelos/consentimientos.ts, modelos/pacientes.ts y
//               utilidades/auditoria.ts.
// Lo usa:       controladores/consentimientos.ts.
//
// Reglas:
//   - Registrar y revocar: quien tenga consents_manage (médico, recepción).
//     Un consentimiento no es contenido clínico, así que no hace falta haber
//     atendido al paciente: recepción lo registra en el mostrador.
//   - Un paciente tiene un solo consentimiento vigente; registrar otro mientras
//     hay uno es un 409. Para renovarlo, primero se revoca el anterior.
//   - Solo se registra para pacientes activos; revocar se puede siempre.
//   - La óptica (consents_read) solo puede preguntar SI hay uno vigente: no ve
//     quién lo registró ni la nota.
//   - Registrar y revocar quedan en la bitácora, con sucursal.
// =============================================================================
import type { GrantConsentInput } from '../esquemas/consentimientos';
import { AppError } from '../intermediarios/errores';
import {
  findConsent,
  hasActiveConsent,
  insertConsent,
  listConsents,
  revokeConsent,
  type Consent,
} from '../modelos/consentimientos';
import { findPatient } from '../modelos/pacientes';
import { auditLog } from '../utilidades/auditoria';

// Quién pide: usuario y sucursal activa (los deja listos el controlador).
export interface ConsentActor {
  userId: string;
  branchId: string;
}

const UNIQUE_VIOLATION = '23505';

// Devuelve el paciente o lanza 404.
async function requirePatient(patientId: string) {
  const patient = await findPatient(patientId);
  if (!patient) throw new AppError('Paciente no encontrado.', 404);
  return patient;
}

// Historial de consentimientos de un paciente (vigente y revocados).
export async function getConsents(patientId: string): Promise<Consent[]> {
  await requirePatient(patientId);
  return listConsents(patientId);
}

// ¿Tiene un consentimiento vigente? Es lo único que sabe la óptica.
export async function getConsentStatus(patientId: string): Promise<{ granted: boolean }> {
  await requirePatient(patientId);
  return { granted: await hasActiveConsent(patientId) };
}

// Registra un consentimiento. Devuelve el consentimiento creado.
export async function grantConsent(
  patientId: string,
  input: GrantConsentInput,
  actor: ConsentActor,
): Promise<Consent> {
  const patient = await requirePatient(patientId);
  if (!patient.is_active) {
    throw new AppError('No se puede registrar un consentimiento de un paciente inactivo.', 409);
  }

  let consentId: string;
  try {
    consentId = await insertConsent({ patientId, grantedBy: actor.userId, note: input.note });
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      throw new AppError('Este paciente ya tiene un consentimiento vigente.', 409);
    }
    throw error;
  }

  await auditLog({
    entityType: 'consent',
    action: 'consent_granted',
    entityId: consentId,
    actorId: actor.userId,
    branchId: actor.branchId,
    detail: { patient_id: patientId },
  });
  return (await findConsent(consentId))!;
}

// Revoca un consentimiento. Devuelve el consentimiento ya revocado.
export async function revoke(patientId: string, consentId: string, actor: ConsentActor): Promise<Consent> {
  await requirePatient(patientId);
  const consent = await findConsent(consentId);
  if (!consent || consent.patient_id !== patientId) throw new AppError('Consentimiento no encontrado.', 404);
  if (!(await revokeConsent(consentId, actor.userId))) {
    throw new AppError('Ese consentimiento ya fue revocado.', 409);
  }

  await auditLog({
    entityType: 'consent',
    action: 'consent_revoked',
    entityId: consentId,
    actorId: actor.userId,
    branchId: actor.branchId,
    detail: { patient_id: patientId },
  });
  return (await findConsent(consentId))!;
}
