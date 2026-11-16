// =============================================================================
// recetas.ts (servicio)
// Qué hace:     las REGLAS de la receta óptica: ver las de un paciente, emitir la
//               de una consulta y reemplazarla cuando hay que corregirla.
// Requerimiento: capacidades prescriptions_author y prescriptions_read
//               (sección 7 del documento de diseño) y consentimiento del paciente
//               para la óptica.
// Depende de:   modelos/recetas.ts, modelos/expedientes.ts, modelos/consentimientos.ts,
//               modelos/pacientes.ts, modelos/auditoria.ts y servicios/accesoPaciente.ts.
// Lo usa:       controladores/recetas.ts.
//
// Reglas:
//   - Emitir: solo un médico, y solo desde la nota ORIGINAL de una consulta que
//     él mismo escribió (la nota ya exige que la cita sea suya y no futura).
//     Cada consulta tiene una sola receta original.
//   - Reemplazar: solo un médico que haya atendido al paciente (no basta una
//     interconsulta). Nunca se edita una receta: se emite otra. Una receta se
//     reemplaza una sola vez (lo garantiza un índice de la base, también cuando
//     dos médicos la corrigen a la vez); para corregir de nuevo se reemplaza la vigente.
//   - Leer, médico o administrador: hace falta acceso al paciente (ver
//     accesoPaciente.ts); ve todas, también las reemplazadas.
//   - Leer, óptica (encargado_venta): solo si el paciente tiene un consentimiento
//     vigente, y solo las recetas vigentes con las medidas y la nota del taller
//     (sin la nota clínica ni quién la escribió más allá de su nombre).
//   - Cada lectura y cada negativa quedan en la bitácora ANTES de entregar datos.
//   - Quién emite y en qué sucursal sale del token y de la sucursal activa.
// =============================================================================
import type { IssuePrescriptionInput, ReplacePrescriptionInput } from '../esquemas/recetas';
import { AppError } from '../intermediarios/errores';
import { createAuditEntry } from '../modelos/auditoria';
import { hasActiveConsent } from '../modelos/consentimientos';
import { findRecord } from '../modelos/expedientes';
import { findPatient } from '../modelos/pacientes';
import {
  findPrescription,
  insertPrescription,
  listPrescriptions,
  type Prescription,
  type PrescriptionMeasures,
} from '../modelos/recetas';
import { auditLog } from '../utilidades/auditoria';
import { requirePatientAccess, type AccessActor } from './accesoPaciente';

// Nombres de los índices que impiden dos recetas originales y dos reemplazos.
const ONE_PER_RECORD = 'uq_prescriptions_una_por_nota';
const ONE_REPLACEMENT = 'uq_prescriptions_un_reemplazo';

// Lo que ve la óptica de una receta: las medidas y la nota del taller, sin
// quién la escribió (más que el nombre), la nota clínica ni la sucursal.
export type OpticalPrescription = Pick<
  Prescription,
  | 'id' | 'created_at' | 'doctor_name'
  | 'od_sphere' | 'od_cylinder' | 'od_axis' | 'od_addition'
  | 'oi_sphere' | 'oi_cylinder' | 'oi_axis' | 'oi_addition'
  | 'pupillary_distance' | 'lens_notes' | 'is_current'
>;

// Lanza 404 si el paciente no existe.
async function assertPatientExists(patientId: string): Promise<void> {
  if (!(await findPatient(patientId))) throw new AppError('Paciente no encontrado.', 404);
}

// Deja solo lo que la óptica puede ver.
function toOptical(prescription: Prescription): OpticalPrescription {
  return {
    id: prescription.id,
    created_at: prescription.created_at,
    doctor_name: prescription.doctor_name,
    od_sphere: prescription.od_sphere,
    od_cylinder: prescription.od_cylinder,
    od_axis: prescription.od_axis,
    od_addition: prescription.od_addition,
    oi_sphere: prescription.oi_sphere,
    oi_cylinder: prescription.oi_cylinder,
    oi_axis: prescription.oi_axis,
    oi_addition: prescription.oi_addition,
    pupillary_distance: prescription.pupillary_distance,
    lens_notes: prescription.lens_notes,
    is_current: prescription.is_current,
  };
}

// Recetas de un paciente. Devuelve las filas y por qué se tiene acceso.
export async function getPrescriptions(
  patientId: string,
  actor: AccessActor,
): Promise<{ rows: Prescription[] | OpticalPrescription[]; access: 'role' | 'appointment' | 'referral' | 'consent' }> {
  await assertPatientExists(patientId);

  if (actor.role === 'encargado_venta') {
    if (!(await hasActiveConsent(patientId))) {
      await createAuditEntry({
        entityType: 'patient',
        action: 'prescription_access_denied',
        entityId: patientId,
        actorId: actor.userId,
        branchId: actor.branchId,
        detail: { reason: 'no_consent' },
      });
      throw new AppError('El paciente no ha autorizado que la óptica vea su receta.', 403);
    }
    await createAuditEntry({
      entityType: 'patient',
      action: 'prescription_viewed',
      entityId: patientId,
      actorId: actor.userId,
      branchId: actor.branchId,
      detail: { access: 'consent' },
    });
    return { rows: (await listPrescriptions(patientId, true)).map(toOptical), access: 'consent' };
  }

  const access = await requirePatientAccess(patientId, actor);
  await createAuditEntry({
    entityType: 'patient',
    action: 'prescription_viewed',
    entityId: patientId,
    actorId: actor.userId,
    branchId: actor.branchId,
    detail: { access: access.reason },
  });
  return { rows: await listPrescriptions(patientId, false), access: access.reason };
}

// Las medidas del cuerpo de la petición, sin los campos que no son medidas.
function measuresOf(input: ReplacePrescriptionInput): PrescriptionMeasures {
  return {
    od_sphere: input.od_sphere, od_cylinder: input.od_cylinder, od_axis: input.od_axis, od_addition: input.od_addition,
    oi_sphere: input.oi_sphere, oi_cylinder: input.oi_cylinder, oi_axis: input.oi_axis, oi_addition: input.oi_addition,
    pupillary_distance: input.pupillary_distance, lens_notes: input.lens_notes,
  };
}

// Emite la receta de una consulta. Devuelve la receta creada.
export async function issuePrescription(
  patientId: string,
  input: IssuePrescriptionInput,
  actor: AccessActor,
): Promise<Prescription> {
  await assertPatientExists(patientId);
  if (actor.role !== 'doctor') {
    throw new AppError('Solo el médico que atendió la consulta puede emitir recetas.', 403);
  }

  const record = await findRecord(input.record_id);
  if (!record || record.patient_id !== patientId) throw new AppError('La nota no existe para este paciente.', 404);
  if (record.amends_id !== null) {
    throw new AppError('La receta se emite desde la nota original de la consulta, no desde una enmienda.', 409);
  }
  if (record.doctor_id !== actor.userId) {
    throw new AppError('Solo el médico que escribió la nota puede emitir su receta.', 403);
  }

  let prescriptionId: string;
  try {
    prescriptionId = await insertPrescription({
      ...measuresOf(input),
      patientId,
      doctorId: actor.userId,
      branchId: actor.branchId,
      recordId: record.id,
      supersedesId: null,
    });
  } catch (error) {
    if ((error as { constraint?: string }).constraint === ONE_PER_RECORD) {
      throw new AppError('Esa consulta ya tiene su receta. Para corregirla, emita una que la reemplace.', 409);
    }
    throw error;
  }

  await auditLog({
    entityType: 'prescription',
    action: 'prescription_issued',
    entityId: prescriptionId,
    actorId: actor.userId,
    branchId: actor.branchId,
    detail: { patient_id: patientId, record_id: record.id },
  });
  return (await findPrescription(prescriptionId))!;
}

// Reemplaza una receta vigente por otra corregida. Devuelve la receta nueva.
export async function replacePrescription(
  patientId: string,
  prescriptionId: string,
  input: ReplacePrescriptionInput,
  actor: AccessActor,
): Promise<Prescription> {
  await assertPatientExists(patientId);
  const access = await requirePatientAccess(patientId, actor);
  if (access.reason !== 'appointment') {
    throw new AppError('Solo un médico que haya atendido al paciente puede reemplazar una receta.', 403);
  }

  const original = await findPrescription(prescriptionId);
  if (!original || original.patient_id !== patientId) throw new AppError('Receta no encontrada.', 404);

  let newId: string;
  try {
    newId = await insertPrescription({
      ...measuresOf(input),
      patientId,
      doctorId: actor.userId,
      branchId: actor.branchId,
      recordId: original.record_id,
      supersedesId: original.id,
    });
  } catch (error) {
    if ((error as { constraint?: string }).constraint === ONE_REPLACEMENT) {
      throw new AppError('Esa receta ya fue reemplazada.', 409);
    }
    throw error;
  }

  await auditLog({
    entityType: 'prescription',
    action: 'prescription_replaced',
    entityId: newId,
    actorId: actor.userId,
    branchId: actor.branchId,
    detail: { patient_id: patientId, supersedes_id: original.id },
  });
  return (await findPrescription(newId))!;
}
