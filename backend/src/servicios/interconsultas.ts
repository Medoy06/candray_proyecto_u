// =============================================================================
// interconsultas.ts (servicio)
// Qué hace:     las REGLAS de la interconsulta: ver las de un paciente, dar una,
//               revocarla y ofrecer a qué médicos se les puede dar.
// Requerimiento: capacidad referrals_manage y acceso temporal entre médicos
//               (sección 7 del documento de diseño).
// Depende de:   modelos/interconsultas.ts, modelos/expedientes.ts,
//               modelos/usuarios.ts, modelos/pacientes.ts y servicios/accesoPaciente.ts.
// Lo usa:       controladores/interconsultas.ts.
//
// Reglas:
//   - Dar una interconsulta: solo un médico que haya atendido al paciente (una
//     interconsulta recibida NO se puede pasar a un tercero). El destinatario
//     debe ser otro médico activo que todavía no atienda al paciente ni tenga
//     ya una interconsulta vigente sobre él.
//   - Dura "days" días (por defecto 14, máximo 30); el servidor calcula el
//     vencimiento.
//   - Revocarla: solo el médico que la dio, y solo mientras siga vigente.
//   - Ver las interconsultas de un paciente: un médico que lo haya atendido
//     (o el administrador, en el perfil de demostración). Quien solo recibió
//     una interconsulta no ve quién más tiene acceso.
//   - Dar y revocar quedan en la bitácora, con sucursal.
// =============================================================================
import type { GrantReferralInput } from '../esquemas/interconsultas';
import { AppError } from '../intermediarios/errores';
import { findActiveReferral } from '../modelos/expedientes';
import {
  findReferral,
  insertReferral,
  listReferralCandidates,
  listReferrals,
  revokeReferral,
  type Referral,
} from '../modelos/interconsultas';
import { findPatient } from '../modelos/pacientes';
import { findUserById } from '../modelos/usuarios';
import { auditLog } from '../utilidades/auditoria';
import { requirePatientAccess, type AccessActor } from './accesoPaciente';

// Lanza 404 si el paciente no existe.
async function assertPatientExists(patientId: string): Promise<void> {
  if (!(await findPatient(patientId))) throw new AppError('Paciente no encontrado.', 404);
}

// Exige que quien pide haya atendido al paciente (o sea el administrador, si
// solo se necesita ver). Devuelve nada; lanza 403 si no.
async function requireCareTeam(patientId: string, actor: AccessActor, adminMaySee: boolean): Promise<void> {
  const access = await requirePatientAccess(patientId, actor);
  const allowed = access.reason === 'appointment' || (adminMaySee && access.reason === 'role');
  if (!allowed) {
    throw new AppError('Solo un médico que haya atendido al paciente puede administrar sus interconsultas.', 403);
  }
}

// Interconsultas de un paciente (vigentes, vencidas y revocadas).
export async function getReferrals(patientId: string, actor: AccessActor): Promise<Referral[]> {
  await assertPatientExists(patientId);
  await requireCareTeam(patientId, actor, true);
  return listReferrals(patientId);
}

// Médicos a los que se les puede dar una interconsulta sobre este paciente.
export async function getCandidates(
  patientId: string,
  actor: AccessActor,
): Promise<{ id: string; full_name: string }[]> {
  await assertPatientExists(patientId);
  await requireCareTeam(patientId, actor, false);
  return listReferralCandidates(patientId, actor.userId);
}

// Da una interconsulta. Devuelve la interconsulta creada.
export async function grantReferral(
  patientId: string,
  input: GrantReferralInput,
  actor: AccessActor,
): Promise<Referral> {
  await assertPatientExists(patientId);
  await requireCareTeam(patientId, actor, false);

  const provider = await findUserById(input.provider_id);
  if (!provider || provider.role !== 'doctor') {
    throw new AppError('El médico indicado no existe o no está activo.', 400);
  }
  if (provider.id === actor.userId) {
    throw new AppError('No puede darse una interconsulta a sí mismo.', 400);
  }
  if (await findActiveReferral(provider.id, patientId)) {
    throw new AppError('Ese médico ya tiene una interconsulta vigente sobre este paciente.', 409);
  }
  const candidates = await listReferralCandidates(patientId, actor.userId);
  if (!candidates.some((candidate) => candidate.id === provider.id)) {
    throw new AppError('Ese médico ya atiende a este paciente: no necesita una interconsulta.', 409);
  }

  const referralId = await insertReferral({
    patientId,
    providerId: provider.id,
    grantedBy: actor.userId,
    reason: input.reason,
    days: input.days,
  });
  const referral = (await findReferral(referralId))!;

  await auditLog({
    entityType: 'referral',
    action: 'referral_granted',
    entityId: referralId,
    actorId: actor.userId,
    branchId: actor.branchId,
    detail: { patient_id: patientId, provider_id: provider.id, expires_at: referral.expires_at },
  });
  return referral;
}

// Revoca una interconsulta. Devuelve la interconsulta ya revocada.
export async function revoke(patientId: string, referralId: string, actor: AccessActor): Promise<Referral> {
  await assertPatientExists(patientId);
  await requireCareTeam(patientId, actor, false);

  const referral = await findReferral(referralId);
  if (!referral || referral.patient_id !== patientId) throw new AppError('Interconsulta no encontrada.', 404);
  if (referral.granted_by !== actor.userId) {
    throw new AppError('Solo el médico que dio la interconsulta puede revocarla.', 403);
  }
  if (!(await revokeReferral(referralId, actor.userId))) {
    throw new AppError('Esa interconsulta ya no está vigente.', 409);
  }

  await auditLog({
    entityType: 'referral',
    action: 'referral_revoked',
    entityId: referralId,
    actorId: actor.userId,
    branchId: actor.branchId,
    detail: { patient_id: patientId, provider_id: referral.provider_id },
  });
  return (await findReferral(referralId))!;
}
