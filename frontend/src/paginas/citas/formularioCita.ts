// =============================================================================
// formularioCita.ts
// Qué hace:     la lógica (sin pantalla) de agendar y reprogramar una cita:
//               validación, comprobar que el horario elegido sigue libre y cómo
//               se arma lo que se envía al servidor.
// Depende de:   servicios/citas.ts y servicios/disponibilidad.ts.
// Lo usa:       paginas/citas/FormularioCita.tsx.
//
// Un horario se identifica por médico + hora (el día y la sucursal son los de
// la ventana). Lo que elige la persona puede quedar desactualizado: otra
// recepcionista pudo tomar esa hora mientras tanto. Por eso `chosenSlotIsFree`
// se calcula siempre contra la disponibilidad más reciente.
// =============================================================================
import type {
  Appointment,
  CreateAppointmentInput,
  RescheduleAppointmentInput,
} from '../../servicios/citas';
import type { DayAvailability } from '../../servicios/disponibilidad';

export const REASON_MAX_LENGTH = 500;

export interface ChosenSlot {
  doctorId: string;
  time: string; // "HH:MM"
}

export interface AppointmentFormValues {
  patientId: string | null; // al reprogramar no se usa: el paciente no cambia
  date: string;             // AAAA-MM-DD
  slot: ChosenSlot | null;
  reason: string;
}

// ¿El horario elegido sigue libre en la disponibilidad más reciente?
export function chosenSlotIsFree(availability: DayAvailability | null, slot: ChosenSlot | null): boolean {
  if (availability === null || slot === null) return false;
  const doctor = availability.doctors.find((entry) => entry.doctor_id === slot.doctorId);
  return doctor?.slots.some((entry) => entry.time === slot.time && entry.status === 'free') ?? false;
}

// El día de una cita ("AAAA-MM-DD HH:MM:SS") y su hora ("HH:MM"), sin pasar por Date.
export const dayOf = (appointment: Appointment): string => appointment.starts_at.slice(0, 10);
export const timeOf = (appointment: Appointment): string => appointment.starts_at.slice(11, 16);

// Texto vacío = sin dato (null), como espera el servidor.
const reasonOrNull = (reason: string): string | null => (reason.trim() === '' ? null : reason.trim());

// Problema al agendar una cita nueva, o '' si todo está bien.
export function validateNewAppointment(values: AppointmentFormValues, slotIsFree: boolean): string {
  if (values.patientId === null) return 'Elija el paciente de la cita.';
  if (values.slot === null || !slotIsFree) return 'Elija un horario disponible.';
  return '';
}

// Lo que se envía al agendar. Solo se llama después de validar.
export function buildNewAppointment(
  values: AppointmentFormValues,
  branchId: string,
): CreateAppointmentInput {
  return {
    patient_id: values.patientId!,
    doctor_id: values.slot!.doctorId,
    branch_id: branchId,
    date: values.date,
    time: values.slot!.time,
    reason: reasonOrNull(values.reason),
  };
}

// Lo que se envía al reprogramar: SOLO lo que cambió respecto de la cita.
// Si la persona no eligió un horario nuevo, el horario no se toca (puede cambiar solo el motivo).
export function buildRescheduleChanges(
  appointment: Appointment,
  values: AppointmentFormValues,
): RescheduleAppointmentInput {
  const changes: RescheduleAppointmentInput = {};
  if (values.slot !== null) {
    if (values.slot.doctorId !== appointment.doctor_id) changes.doctor_id = values.slot.doctorId;
    if (values.date !== dayOf(appointment)) changes.date = values.date;
    if (values.slot.time !== timeOf(appointment)) changes.time = values.slot.time;
  }
  if (reasonOrNull(values.reason) !== appointment.reason) changes.reason = reasonOrNull(values.reason);
  return changes;
}
