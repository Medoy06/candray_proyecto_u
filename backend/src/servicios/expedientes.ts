// =============================================================================
// expedientes.ts (servicio)
// Qué hace:     las REGLAS del expediente clínico: consultar el historial de un
//               paciente, escribir la nota de una consulta y enmendar una nota.
// Requerimiento: RF-01, RF-08, RF-09, RB-03 y RB-04 (sección 7 y 8 del documento
//               de diseño).
// Depende de:   modelos/expedientes.ts, modelos/citas.ts, modelos/pacientes.ts,
//               modelos/auditoria.ts y servicios/accesoPaciente.ts.
// Lo usa:       controladores/expedientes.ts.
//
// Reglas:
//   - Leer: hace falta acceso al paciente (cita o interconsulta; ver
//     accesoPaciente.ts). Cada lectura se escribe en la bitácora ANTES de
//     entregar los datos (RF-09): si no se puede dejar constancia, no se lee.
//   - Escribir una nota: solo el médico de la cita, sobre una cita de ese
//     paciente que no esté cancelada, no sea ausencia y no sea de una fecha
//     futura. Cada consulta tiene una sola nota.
//   - Consultas sin nota: cada médico ve las suyas con ese paciente (para elegir
//     a cuál escribirle la nota); no es un dato clínico, así que no se audita.
//   - Enmendar: solo un médico que haya atendido al paciente (no basta una
//     interconsulta, que es de lectura). Nunca se edita una nota: se agrega otra.
//   - Quién escribe y en qué sucursal sale del token y de la sucursal activa
//     (RB-03), nunca del cuerpo de la petición.
// =============================================================================
import type { AmendRecordInput, CreateRecordInput, ListRecordsQuery } from '../esquemas/expedientes';
import { AppError } from '../intermediarios/errores';
import { createAuditEntry } from '../modelos/auditoria';
import { findAppointment } from '../modelos/citas';
import {
  findRecord,
  insertRecord,
  listPendingConsultations,
  listRecords,
  type PendingConsultation,
  type RecordEntry,
} from '../modelos/expedientes';
import { findPatient } from '../modelos/pacientes';
import { auditLog } from '../utilidades/auditoria';
import { todayInElSalvador } from '../utilidades/fechas';
import { requirePatientAccess, type AccessActor, type PatientAccess } from './accesoPaciente';

// Nombre de la restricción de la base que impide dos notas para la misma cita.
const ONE_NOTE_PER_APPOINTMENT = 'uq_medical_records_una_nota_por_cita';

// Lanza 404 si el paciente no existe.
async function assertPatientExists(patientId: string): Promise<void> {
  if (!(await findPatient(patientId))) throw new AppError('Paciente no encontrado.', 404);
}

// Historial del paciente. Devuelve la página, el total y por qué se tiene acceso.
export async function getHistory(
  patientId: string,
  query: ListRecordsQuery,
  actor: AccessActor,
): Promise<{ rows: RecordEntry[]; total: number; access: PatientAccess }> {
  await assertPatientExists(patientId);
  const access = await requirePatientAccess(patientId, actor);

  // Constancia de la lectura, antes de entregar nada (RF-09). Se llama
  // directamente a createAuditEntry: si falla, la petición falla.
  await createAuditEntry({
    entityType: 'patient',
    action: 'record_viewed',
    entityId: patientId,
    actorId: actor.userId,
    branchId: actor.branchId,
    detail: { access: access.reason },
  });

  const { rows, total } = await listRecords(patientId, query.page, query.page_size);
  return { rows, total, access };
}

// Escribe la nota de una consulta. Devuelve la nota creada.
export async function writeNote(
  patientId: string,
  input: CreateRecordInput,
  actor: AccessActor,
): Promise<RecordEntry> {
  await assertPatientExists(patientId);
  if (actor.role !== 'doctor') {
    throw new AppError('Solo el médico que atendió la consulta puede escribir en el expediente.', 403);
  }

  const appointment = await findAppointment(input.appointment_id);
  if (!appointment || appointment.patient_id !== patientId) {
    throw new AppError('La cita no existe para este paciente.', 404);
  }
  if (appointment.doctor_id !== actor.userId) {
    throw new AppError('Solo el médico de la cita puede escribir su nota.', 403);
  }
  if (appointment.status === 'cancelled') {
    throw new AppError('No se puede escribir la nota de una cita cancelada.', 409);
  }
  if (appointment.status === 'no_show') {
    throw new AppError('El paciente no asistió a esa cita: no hay consulta que registrar.', 409);
  }
  if (appointment.starts_at.slice(0, 10) > todayInElSalvador()) {
    throw new AppError('No se puede escribir la nota de una cita de una fecha futura.', 409);
  }

  let recordId: string;
  try {
    recordId = await insertRecord({
      patientId,
      doctorId: actor.userId,
      branchId: actor.branchId,
      appointmentId: appointment.id,
      amendsId: null,
      diagnosis: input.diagnosis,
      treatment: input.treatment ?? null,
      notes: input.notes ?? null,
    });
  } catch (error) {
    if ((error as { constraint?: string }).constraint === ONE_NOTE_PER_APPOINTMENT) {
      throw new AppError('Esa consulta ya tiene su nota. Para corregirla, agregue una enmienda.', 409);
    }
    throw error;
  }

  await auditLog({
    entityType: 'medical_record',
    action: 'record_created',
    entityId: recordId,
    actorId: actor.userId,
    branchId: actor.branchId,
    detail: { patient_id: patientId, appointment_id: appointment.id },
  });
  return (await findRecord(recordId))!;
}

// Agrega una enmienda a una nota. Devuelve la enmienda creada.
export async function amendNote(
  patientId: string,
  recordId: string,
  input: AmendRecordInput,
  actor: AccessActor,
): Promise<RecordEntry> {
  await assertPatientExists(patientId);
  const access = await requirePatientAccess(patientId, actor);
  if (access.reason !== 'appointment') {
    throw new AppError('Solo un médico que haya atendido al paciente puede enmendar su expediente.', 403);
  }

  const original = await findRecord(recordId);
  if (!original || original.patient_id !== patientId) throw new AppError('Nota no encontrada.', 404);

  const amendmentId = await insertRecord({
    patientId,
    doctorId: actor.userId,
    branchId: actor.branchId,
    appointmentId: null,
    amendsId: original.id,
    diagnosis: input.diagnosis,
    treatment: input.treatment ?? null,
    notes: input.notes ?? null,
  });

  await auditLog({
    entityType: 'medical_record',
    action: 'record_amended',
    entityId: amendmentId,
    actorId: actor.userId,
    branchId: actor.branchId,
    detail: { patient_id: patientId, amends_id: original.id },
  });
  return (await findRecord(amendmentId))!;
}

// Citas del propio médico con el paciente que todavía no tienen nota.
export async function getPendingConsultations(patientId: string, actor: AccessActor): Promise<PendingConsultation[]> {
  await assertPatientExists(patientId);
  if (actor.role !== 'doctor') {
    throw new AppError('Solo el médico que atendió la consulta puede escribir en el expediente.', 403);
  }
  return listPendingConsultations(actor.userId, patientId, todayInElSalvador());
}
