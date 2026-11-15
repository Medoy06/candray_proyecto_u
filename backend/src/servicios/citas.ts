// =============================================================================
// citas.ts (servicio)
// Qué hace:     las REGLAS de las citas: consultar la agenda, agendar,
//               reprogramar y cambiar el estado, con su auditoría.
// Requerimiento: RB-02 y capacidades appointments_read / appointments_manage
//               (sección 7 del documento de diseño).
// Depende de:   modelos/citas.ts, modelos/pacientes.ts, modelos/usuarios.ts,
//               modelos/horarios.ts y las
//               utilidades de transacción, auditoría, fechas y franjas.
// Lo usa:       controladores/citas.ts.
//
// Reglas para agendar o reprogramar (el lugar y la hora de la cita):
//   - La sucursal debe ser una a la que quien agenda tiene acceso (el alcance
//     solo incluye sucursales activas, así que una inactiva queda fuera).
//   - La persona debe ser un MÉDICO activo asignado a esa sucursal.
//   - La hora no puede haber pasado.
//   - La cita debe caber completa dentro de un bloque de atención del médico en
//     esa sucursal y ese día de la semana.
//   - El médico y el paciente no pueden tener otra cita a esa hora (RB-02). La
//     base lo garantiza aunque dos personas agenden a la vez; aquí se traduce
//     el error a un mensaje claro.
// Reglas de estado: solo una cita AGENDADA cambia. Se puede cancelar, o marcar
// como atendida o como ausencia (estas dos, solo cuando la hora ya llegó).
// Los médicos solo ven SUS citas.
// =============================================================================
import type {
  ChangeAppointmentStatusInput,
  CreateAppointmentInput,
  ListAppointmentsQuery,
  RescheduleAppointmentInput,
} from '../esquemas/citas';
import { AppError } from '../intermediarios/errores';
import {
  findAppointment,
  insertAppointment,
  listAppointments,
  listDoctorBlocks,
  updateAppointmentSlot,
  updateAppointmentStatus,
  type Appointment,
  type AppointmentSlot,
  type AppointmentStatus,
} from '../modelos/citas';
import { isDoctorAssignedToBranch } from '../modelos/horarios';
import { findPatient } from '../modelos/pacientes';
import { findUserById } from '../modelos/usuarios';
import { auditLog } from '../utilidades/auditoria';
import { isoWeekday, nowInElSalvador } from '../utilidades/fechas';
import { SLOT_MINUTES, toMinutes } from '../utilidades/franjas';
import { withTransaction } from '../utilidades/transaccion';

// Quién consulta o actúa: su id, si es médico y a qué sucursales tiene acceso.
export interface AppointmentActor {
  userId: string;
  isDoctor: boolean;
  allowedBranchIds: string[];
}

// Nombre de cada restricción de la base (migración 05) y su mensaje.
const OVERLAP_MESSAGES: Record<string, string> = {
  ex_appointments_medico_sin_cruces: 'El médico ya tiene una cita a esa hora.',
  ex_appointments_paciente_sin_cruces: 'El paciente ya tiene una cita a esa hora.',
};

// Convierte el error de cruce de la base (23P01) en un 409 claro.
function translateOverlap(error: unknown): never {
  const { code, constraint } = error as { code?: string; constraint?: string };
  if (code === '23P01') {
    throw new AppError(OVERLAP_MESSAGES[constraint ?? ''] ?? 'Esa hora ya está ocupada.', 409);
  }
  throw error;
}

// 'AAAA-MM-DD HH:MM:SS' -> fecha y hora por separado.
const dateOf = (timestamp: string): string => timestamp.slice(0, 10);
const timeOf = (timestamp: string): string => timestamp.slice(11, 16);

// Comprueba todo lo que se exige del lugar y la hora de una cita. Lanza 403, o
// 400 con el motivo.
async function assertSlotIsBookable(slot: AppointmentSlot, allowedBranchIds: string[]): Promise<void> {
  if (!allowedBranchIds.includes(slot.branch_id)) {
    throw new AppError('No tiene acceso a esa sucursal.', 403);
  }

  // findUserById solo devuelve usuarios activos: uno desactivado cuenta como inexistente.
  const doctor = await findUserById(slot.doctor_id);
  if (!doctor || doctor.role !== 'doctor') {
    throw new AppError('El usuario indicado no es un médico activo.', 400);
  }
  if (!(await isDoctorAssignedToBranch(slot.doctor_id, slot.branch_id))) {
    throw new AppError('El médico no está asignado a esa sucursal.', 400);
  }

  if (`${slot.date} ${slot.time}` <= nowInElSalvador()) {
    throw new AppError('No se puede agendar una cita en una fecha u hora que ya pasó.', 400);
  }

  // La cita entera (inicio y fin) debe caber en un bloque del médico.
  const blocks = await listDoctorBlocks(slot.doctor_id, slot.branch_id, isoWeekday(slot.date));
  const start = toMinutes(slot.time);
  const fits = blocks.some(
    (block) => start >= toMinutes(block.start_time) && start + SLOT_MINUTES <= toMinutes(block.end_time),
  );
  if (!fits) {
    throw new AppError('Ese horario está fuera de la atención del médico en esa sucursal.', 400);
  }
}

// Busca una cita visible para quien consulta, o lanza 404. Una cita de una
// sucursal ajena, o de otro médico si quien consulta es médico, se trata como
// si no existiera.
function assertVisible(appointment: Appointment | null, actor: AppointmentActor): Appointment {
  if (
    !appointment ||
    !actor.allowedBranchIds.includes(appointment.branch_id) ||
    (actor.isDoctor && appointment.doctor_id !== actor.userId)
  ) {
    throw new AppError('Cita no encontrada.', 404);
  }
  return appointment;
}

// Consulta la agenda. Devuelve la página y el total.
export async function search(
  query: ListAppointmentsQuery,
  actor: AppointmentActor,
): Promise<{ rows: Appointment[]; total: number }> {
  if (query.branch_id && !actor.allowedBranchIds.includes(query.branch_id)) {
    throw new AppError('No tiene acceso a esa sucursal.', 403);
  }
  return listAppointments(query, actor.allowedBranchIds, actor.isDoctor ? actor.userId : null);
}

// Devuelve una cita o lanza 404.
export async function getAppointment(appointmentId: string, actor: AppointmentActor): Promise<Appointment> {
  return assertVisible(await findAppointment(appointmentId), actor);
}

// Agenda una cita. `activeBranchId` se usa si no se indica sucursal.
export async function createAppointment(
  input: CreateAppointmentInput,
  actor: AppointmentActor,
  activeBranchId: string,
): Promise<Appointment> {
  const slot: AppointmentSlot = {
    doctor_id: input.doctor_id,
    branch_id: input.branch_id ?? activeBranchId,
    date: input.date,
    time: input.time,
    reason: input.reason ?? null,
  };
  await assertSlotIsBookable(slot, actor.allowedBranchIds);

  const patient = await findPatient(input.patient_id);
  if (!patient || !patient.is_active) {
    throw new AppError('El paciente no existe o está inactivo.', 400);
  }

  let appointmentId: string;
  try {
    appointmentId = await insertAppointment({
      patient_id: input.patient_id,
      ...slot,
      created_by: actor.userId,
    });
  } catch (error) {
    translateOverlap(error);
  }

  await auditLog({
    entityType: 'appointment',
    action: 'appointment_created',
    entityId: appointmentId,
    actorId: actor.userId,
    branchId: slot.branch_id,
    detail: { patient_id: input.patient_id, doctor_id: slot.doctor_id, starts_at: `${slot.date} ${slot.time}` },
  });
  return getAppointment(appointmentId, actor);
}

// Reprograma una cita agendada (otro día, hora, médico o sucursal) o cambia su motivo.
export async function rescheduleAppointment(
  appointmentId: string,
  changes: RescheduleAppointmentInput,
  actor: AppointmentActor,
): Promise<Appointment> {
  let detail: Record<string, unknown> | null;
  try {
    detail = await withTransaction(async (tx) => {
      const current = assertVisible(await findAppointment(appointmentId, tx), actor); // fila bloqueada
      if (current.status !== 'scheduled') {
        throw new AppError('Solo se puede reprogramar una cita agendada.', 409);
      }

      // Valor final de cada campo: el enviado, o el que ya tenía.
      const next: AppointmentSlot = {
        doctor_id: changes.doctor_id ?? current.doctor_id,
        branch_id: changes.branch_id ?? current.branch_id,
        date: changes.date ?? dateOf(current.starts_at),
        time: changes.time ?? timeOf(current.starts_at),
        reason: changes.reason !== undefined ? changes.reason : current.reason,
      };

      // Se registran solo los campos que de verdad cambiaron. El motivo puede
      // ser texto personal: se anota que cambió, no su contenido.
      const changed: Record<string, unknown> = {};
      if (next.doctor_id !== current.doctor_id) changed.doctor_id = { from: current.doctor_id, to: next.doctor_id };
      if (next.branch_id !== current.branch_id) changed.branch_id = { from: current.branch_id, to: next.branch_id };
      const before = `${dateOf(current.starts_at)} ${timeOf(current.starts_at)}`;
      const after = `${next.date} ${next.time}`;
      if (before !== after) changed.starts_at = { from: before, to: after };
      const slotChanged = Object.keys(changed).length > 0;
      if (next.reason !== current.reason) changed.reason = true;
      if (Object.keys(changed).length === 0) return null;

      // Las reglas de lugar y hora solo se revisan si el lugar o la hora cambian:
      // corregir el motivo de una cita de hoy que ya empezó debe seguir siendo posible.
      if (slotChanged) await assertSlotIsBookable(next, actor.allowedBranchIds);
      await updateAppointmentSlot(tx, appointmentId, next);
      return changed;
    });
  } catch (error) {
    translateOverlap(error);
  }

  const updated = await getAppointment(appointmentId, actor);
  if (detail) {
    await auditLog({
      entityType: 'appointment',
      action: 'appointment_rescheduled',
      entityId: appointmentId,
      actorId: actor.userId,
      branchId: updated.branch_id,
      detail,
    });
  }
  return updated;
}

// Acción de auditoría de cada estado nuevo.
const STATUS_ACTIONS: Record<Exclude<AppointmentStatus, 'scheduled'>, string> = {
  cancelled: 'appointment_cancelled',
  completed: 'appointment_completed',
  no_show: 'appointment_no_show',
};

// Cambia el estado de una cita agendada: cancelada, atendida o ausencia.
export async function changeAppointmentStatus(
  appointmentId: string,
  input: ChangeAppointmentStatusInput,
  actor: AppointmentActor,
): Promise<Appointment> {
  await withTransaction(async (tx) => {
    const current = assertVisible(await findAppointment(appointmentId, tx), actor); // fila bloqueada
    if (current.status !== 'scheduled') {
      throw new AppError('Solo se puede cambiar el estado de una cita agendada.', 409);
    }
    // Atendida o ausente solo tienen sentido cuando la hora de la cita ya llegó.
    if (input.status !== 'cancelled' && current.starts_at.slice(0, 16) > nowInElSalvador()) {
      throw new AppError('La cita todavía no ha comenzado.', 400);
    }
    await updateAppointmentStatus(tx, appointmentId, input.status, input.cancellation_reason ?? null);
  });

  const updated = await getAppointment(appointmentId, actor);
  await auditLog({
    entityType: 'appointment',
    action: STATUS_ACTIONS[input.status],
    entityId: appointmentId,
    actorId: actor.userId,
    branchId: updated.branch_id,
    detail: { from: 'scheduled', to: input.status },
  });
  return updated;
}
