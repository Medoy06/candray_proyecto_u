// =============================================================================
// accesoPaciente.ts (servicio)
// Qué hace:     decide si una persona puede abrir el expediente de un paciente,
//               y por qué. Es la ÚNICA puerta de acceso a los datos clínicos.
// Requerimiento: RF-08 y RB-04 (acceso a la información clínica por rol) y la
//               regla "falla cerrada" (sección 8 del documento de diseño).
// Depende de:   modelos/expedientes.ts, modelos/auditoria.ts e intermediarios/errores.ts.
// Lo usa:       servicios/expedientes.ts.
//
// Quién entra y por qué razón:
//   - Un médico, si tiene una cita con ese paciente (razón "appointment") o una
//     interconsulta vigente (razón "referral"). La sucursal en la que esté
//     trabajando no importa: el historial es el mismo desde las seis (RB-04).
//   - El administrador, solo si la ruta ya le dio la capacidad (perfil
//     "demostracion"); razón "role".
//   - Cualquier otro rol: nunca, aunque alguien le agregue la capacidad por
//     error. Se lista explícitamente a quién se deja pasar; el resto se niega.
//
// FALLA CERRADA: si la comprobación misma falla (por ejemplo, la base de datos
// no responde), la respuesta es "sin acceso", nunca "con acceso".
//
// Cada negativa se escribe en la bitácora llamando directamente a
// createAuditEntry y NO a auditLog: auditLog se traga sus errores, y aquí dejar
// constancia de la negativa es parte de la regla. Si la bitácora falla, la
// petición termina en error y tampoco se entrega ningún dato.
// =============================================================================
import type { Role } from '../configuracion/roles';
import { AppError } from '../intermediarios/errores';
import { createAuditEntry } from '../modelos/auditoria';
import { doctorHasAppointmentWith, findActiveReferral } from '../modelos/expedientes';

// Quién pide acceso: su id, su rol y la sucursal en la que trabaja ahora.
export interface AccessActor {
  userId: string;
  role: Role;
  branchId: string;
}

// Por qué se concedió el acceso.
export type PatientAccess =
  | { reason: 'role' }
  | { reason: 'appointment' }
  | { reason: 'referral'; expiresAt: string };

// Decide el acceso. Devuelve null si no hay razón para concederlo.
// Si una consulta a la base falla, el error sube; quien llama lo trata como negativa.
async function evaluateAccess(patientId: string, actor: AccessActor): Promise<PatientAccess | null> {
  if (actor.role === 'admin') return { reason: 'role' };
  if (actor.role !== 'doctor') return null;

  if (await doctorHasAppointmentWith(actor.userId, patientId)) return { reason: 'appointment' };

  const referral = await findActiveReferral(actor.userId, patientId);
  if (referral) return { reason: 'referral', expiresAt: referral.expires_at };

  return null;
}

// Exige acceso al expediente del paciente.
// Recibe: el paciente y quién lo pide.
// Devuelve: por qué se concedió el acceso.
// Lanza 403 (y deja constancia en la bitácora) si no corresponde, o si la
// comprobación falló.
export async function requirePatientAccess(patientId: string, actor: AccessActor): Promise<PatientAccess> {
  let access: PatientAccess | null = null;
  let checkFailed = false;

  try {
    access = await evaluateAccess(patientId, actor);
  } catch (error) {
    checkFailed = true;
    console.error('[acceso a pacientes] no se pudo verificar el acceso; se niega:', error);
  }

  if (access) return access;

  await createAuditEntry({
    entityType: 'patient',
    action: 'record_access_denied',
    entityId: patientId,
    actorId: actor.userId,
    branchId: actor.branchId,
    detail: { reason: checkFailed ? 'check_failed' : 'no_relation' },
  });
  throw new AppError('No tiene acceso al expediente de este paciente.', 403);
}
