// =============================================================================
// mensajeRecordatorio.ts
// Qué hace:     arma el texto del recordatorio que se le enviaría a un paciente.
// Depende de:   servicios/recordatorios.ts y utilidades/formatoFecha.ts.
// Lo usa:       paginas/recordatorios/TablaRecordatorios.tsx.
//
// Función pura (sin React): se prueba directo. El mensaje solo lleva lo que el
// paciente necesita para presentarse: cuándo, dónde y con quién.
// =============================================================================
import type { Reminder } from '../../servicios/recordatorios';
import { formatDate, formatTime } from '../../utilidades/formatoFecha';

// Devuelve, por ejemplo:
//   "Estimado(a) Ana Pérez: le recordamos su cita del 16/11/2026 a las 09:00 en
//    Candray Central con Dra. Lucía Rivas."
export function reminderMessage(reminder: Reminder): string {
  return (
    `Estimado(a) ${reminder.patient_name}: le recordamos su cita del ${formatDate(reminder.starts_at)} ` +
    `a las ${formatTime(reminder.starts_at)} en ${reminder.branch_name} con ${reminder.doctor_name}.`
  );
}
