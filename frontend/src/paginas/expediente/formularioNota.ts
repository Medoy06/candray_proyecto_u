// =============================================================================
// formularioNota.ts
// Qué hace:     la lógica SIN pantalla del formulario de notas del expediente:
//               límites de texto, validación y armado del cuerpo que se envía.
//               Sirve tanto para escribir una nota como para enmendarla.
// Depende de:   servicios/expedientes.ts (solo los tipos).
// Lo usan:      paginas/expediente/FormularioNota.tsx y FormularioEnmienda.tsx.
//
// Los límites son los mismos que valida el servidor y la base de datos
// (migración 06): aquí se revisan antes para avisar sin esperar la respuesta,
// pero quien decide es el servidor.
// =============================================================================
import type { AmendNoteInput, CreateNoteInput } from '../../servicios/expedientes';

export const DIAGNOSIS_MAX_LENGTH = 2000;
export const TREATMENT_MAX_LENGTH = 2000;
export const NOTES_MAX_LENGTH = 4000;

export interface NoteFormValues {
  appointmentId: string; // la consulta a la que pertenece la nota (solo al escribir una nota nueva)
  diagnosis: string;
  treatment: string;
  notes: string;
}

export const EMPTY_NOTE_FORM: NoteFormValues = { appointmentId: '', diagnosis: '', treatment: '', notes: '' };

// Devuelve el primer problema encontrado como mensaje, o '' si todo está bien.
// requireAppointment: true al escribir una nota nueva (hay que elegir la consulta).
export function validateNoteForm(values: NoteFormValues, requireAppointment: boolean): string {
  if (requireAppointment && values.appointmentId === '') return 'Elija la consulta a la que pertenece la nota.';
  if (values.diagnosis.trim() === '') return 'El diagnóstico es obligatorio.';
  if (values.diagnosis.trim().length > DIAGNOSIS_MAX_LENGTH) {
    return `El diagnóstico no puede pasar de ${DIAGNOSIS_MAX_LENGTH} caracteres.`;
  }
  if (values.treatment.trim().length > TREATMENT_MAX_LENGTH) {
    return `El tratamiento no puede pasar de ${TREATMENT_MAX_LENGTH} caracteres.`;
  }
  if (values.notes.trim().length > NOTES_MAX_LENGTH) {
    return `Las notas no pueden pasar de ${NOTES_MAX_LENGTH} caracteres.`;
  }
  return '';
}

// Un campo opcional vacío se envía como null (no como texto vacío).
const orNull = (text: string): string | null => (text.trim() === '' ? null : text.trim());

// El cuerpo para escribir la nota de una consulta.
export function buildCreateInput(values: NoteFormValues): CreateNoteInput {
  return {
    appointment_id: values.appointmentId,
    diagnosis: values.diagnosis.trim(),
    treatment: orNull(values.treatment),
    notes: orNull(values.notes),
  };
}

// El cuerpo para enmendar una nota.
export function buildAmendInput(values: NoteFormValues): AmendNoteInput {
  return {
    diagnosis: values.diagnosis.trim(),
    treatment: orNull(values.treatment),
    notes: orNull(values.notes),
  };
}

// Los valores de partida de una enmienda: el contenido de la nota que se corrige,
// para que la persona cambie solo lo que haga falta.
export function formFromEntry(entry: { diagnosis: string; treatment: string | null; notes: string | null }): NoteFormValues {
  return { appointmentId: '', diagnosis: entry.diagnosis, treatment: entry.treatment ?? '', notes: entry.notes ?? '' };
}
