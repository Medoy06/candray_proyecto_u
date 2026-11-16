// =============================================================================
// formularioHorario.ts
// Qué hace:     las funciones puras del formulario de un bloque de horario:
//               las horas que se pueden elegir, la validación y el armado de lo
//               que se envía al servidor.
// Depende de:   servicios/horarios.ts.
// Lo usa:       paginas/horarios/FormularioHorario.tsx.
//
// Sin React y sin llamadas al servidor, para poder probarlas solas. Las reglas
// de fondo (cruces, citas cubiertas) las decide el servidor; aquí solo se
// evita enviar lo que está claramente mal.
// =============================================================================
import type { CreateScheduleInput, ScheduleBlock, UpdateScheduleInput } from '../../servicios/horarios';

// Lo que muestra el formulario. Todo es texto porque viene de los campos.
export interface ScheduleFormValues {
  weekday: string;   // "1" a "7"
  branchId: string;
  start: string;     // "HH:MM"
  end: string;       // "HH:MM"
}

// Pasa "08:30" o "08:30:00" a minutos desde la medianoche.
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

// Pasa minutos desde la medianoche a "HH:MM".
function toHourMinute(totalMinutes: number): string {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Las horas en punto y y media entre la apertura y el cierre de la sucursal,
// ambas incluidas. El servidor solo acepta horas así.
export function timeOptions(opening: string, closing: string): string[] {
  const options: string[] = [];
  for (let minutes = toMinutes(opening); minutes <= toMinutes(closing); minutes += 30) {
    options.push(toHourMinute(minutes));
  }
  return options;
}

// Agrega el valor actual a la lista si no está (por ejemplo, un bloque guardado
// cuando la sucursal abría a otra hora), para que el campo no muestre una hora
// distinta de la que realmente tiene.
export function withValue(options: string[], value: string): string[] {
  if (value === '' || options.includes(value)) return options;
  return [...options, value].sort();
}

// Devuelve el mensaje del primer problema, o '' si todo está bien.
export function validateScheduleForm(values: ScheduleFormValues): string {
  if (values.branchId === '') return 'Elija la sucursal.';
  if (values.start === '' || values.end === '') return 'Elija la hora de inicio y la de fin.';
  if (toMinutes(values.start) >= toMinutes(values.end)) return 'La hora de inicio debe ser anterior a la de fin.';
  return '';
}

// Los valores iniciales: los del bloque si se edita, o los de un bloque nuevo.
export function initialValues(block: ScheduleBlock | null, defaultBranchId: string, opening: string, closing: string): ScheduleFormValues {
  if (block !== null) {
    return {
      weekday: String(block.weekday),
      branchId: block.branch_id,
      start: block.start_time.slice(0, 5),
      end: block.end_time.slice(0, 5),
    };
  }
  return { weekday: '1', branchId: defaultBranchId, start: opening.slice(0, 5), end: closing.slice(0, 5) };
}

// Lo que se envía al crear.
export function buildCreateInput(doctorId: string, values: ScheduleFormValues): CreateScheduleInput {
  return {
    doctor_id: doctorId,
    branch_id: values.branchId,
    weekday: Number(values.weekday),
    start_time: values.start,
    end_time: values.end,
  };
}

// Lo que se envía al editar: solo los campos que cambiaron.
export function buildChanges(block: ScheduleBlock, values: ScheduleFormValues): UpdateScheduleInput {
  const changes: UpdateScheduleInput = {};
  if (values.branchId !== block.branch_id) changes.branch_id = values.branchId;
  if (Number(values.weekday) !== block.weekday) changes.weekday = Number(values.weekday);
  if (values.start !== block.start_time.slice(0, 5)) changes.start_time = values.start;
  if (values.end !== block.end_time.slice(0, 5)) changes.end_time = values.end;
  return changes;
}
