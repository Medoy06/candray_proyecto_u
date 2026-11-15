// =============================================================================
// formularioPaciente.ts
// Qué hace:     la lógica (sin pantalla) del formulario de pacientes: valores
//               iniciales, validación y cómo se arma lo que se envía al servidor
//               al registrar y al editar.
// Depende de:   servicios/pacientes.ts.
// Lo usa:       paginas/pacientes/FormularioPaciente.tsx.
//
// Las reglas son las mismas que valida el backend (esquemas/pacientes.ts):
// avisar aquí ahorra un viaje al servidor, pero el servidor tiene la última palabra.
// Un detalle: "no puede ser futura" se compara con la fecha de este navegador;
// el servidor la compara con la de El Salvador y decide en caso de diferencia.
// =============================================================================
import type { CreatePatientInput, Patient, UpdatePatientInput } from '../../servicios/pacientes';

// Todo en texto, tal como lo escribe la persona; se convierte al enviar.
export interface PatientFormValues {
  full_name: string;
  birth_date: string; // "AAAA-MM-DD" o '' si no se ha elegido
  phone: string;
  dui: string;
  email: string;
}

export const EMPTY_PATIENT_FORM: PatientFormValues = {
  full_name: '',
  birth_date: '',
  phone: '',
  dui: '',
  email: '',
};

// Límites que comparte el formulario y las reglas.
export const MIN_BIRTH_DATE = '1900-01-01';
export const PHONE_MIN_LENGTH = 8;
export const PHONE_MAX_LENGTH = 30;
export const NAME_MAX_LENGTH = 255;

const PHONE_PATTERN = /^[0-9+() -]+$/;
const DUI_PATTERN = /^\d{8}-\d$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// La fecha de hoy como "AAAA-MM-DD" (sirve de tope para la fecha de nacimiento).
export function todayText(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// ¿El texto es una fecha que existe? (rechaza, por ejemplo, 2026-02-31)
function isRealDate(text: string): boolean {
  const match = DATE_PATTERN.exec(text);
  if (match === null) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Si el día no existe en ese mes (31 de febrero), JavaScript lo corre al mes
  // siguiente y el día o el año ya no coinciden; con mes 0 o 13 cambia el año.
  return date.getUTCFullYear() === year && date.getUTCDate() === day;
}

// Los valores del formulario al editar un paciente que ya existe.
export function formFromPatient(patient: Patient): PatientFormValues {
  return {
    full_name: patient.full_name,
    birth_date: patient.birth_date,
    phone: patient.phone,
    dui: patient.dui ?? '',
    email: patient.email ?? '',
  };
}

// Devuelve el primer problema que encuentre, o '' si todo está bien.
// `today` se puede indicar para las pruebas.
export function validatePatientForm(values: PatientFormValues, today: string = todayText()): string {
  const name = values.full_name.trim();
  if (name.length < 2) return 'Escriba el nombre completo del paciente (mínimo 2 caracteres).';
  if (name.length > NAME_MAX_LENGTH) return `El nombre es demasiado largo (máximo ${NAME_MAX_LENGTH} caracteres).`;

  if (values.birth_date === '') return 'Indique la fecha de nacimiento.';
  if (!isRealDate(values.birth_date)) return 'La fecha de nacimiento no es válida.';
  if (values.birth_date < MIN_BIRTH_DATE) return 'La fecha de nacimiento es demasiado antigua.';
  if (values.birth_date > today) return 'La fecha de nacimiento no puede ser futura.';

  const phone = values.phone.trim();
  if (phone === '') return 'Escriba el teléfono del paciente.';
  if (phone.length < PHONE_MIN_LENGTH || phone.length > PHONE_MAX_LENGTH || !PHONE_PATTERN.test(phone)) {
    return `El teléfono debe tener entre ${PHONE_MIN_LENGTH} y ${PHONE_MAX_LENGTH} caracteres: números, espacios, guion, + o paréntesis.`;
  }

  const dui = values.dui.trim();
  if (dui !== '' && !DUI_PATTERN.test(dui)) return 'El DUI debe tener el formato 01234567-8.';

  const email = values.email.trim();
  if (email !== '' && (!EMAIL_PATTERN.test(email) || email.length > 255)) return 'El correo no es válido.';

  return '';
}

// Texto vacío = sin dato (null), como espera el servidor.
const textOrNull = (text: string): string | null => (text.trim() === '' ? null : text.trim());

// El correo se guarda en minúsculas (el servidor hace lo mismo).
const emailOrNull = (text: string): string | null => textOrNull(text)?.toLowerCase() ?? null;

// Lo que se envía al registrar.
export function buildCreateInput(values: PatientFormValues): CreatePatientInput {
  return {
    full_name: values.full_name.trim(),
    birth_date: values.birth_date,
    phone: values.phone.trim(),
    dui: textOrNull(values.dui),
    email: emailOrNull(values.email),
  };
}

// Lo que se envía al editar: SOLO los campos que cambiaron respecto del paciente.
export function buildPatientChanges(patient: Patient, values: PatientFormValues): UpdatePatientInput {
  const changes: UpdatePatientInput = {};
  if (values.full_name.trim() !== patient.full_name) changes.full_name = values.full_name.trim();
  if (values.birth_date !== patient.birth_date) changes.birth_date = values.birth_date;
  if (values.phone.trim() !== patient.phone) changes.phone = values.phone.trim();
  if (textOrNull(values.dui) !== patient.dui) changes.dui = textOrNull(values.dui);
  if (emailOrNull(values.email) !== patient.email) changes.email = emailOrNull(values.email);
  return changes;
}
