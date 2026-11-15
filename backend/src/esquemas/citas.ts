// =============================================================================
// citas.ts (esquema)
// Qué hace:     define la forma de lo que el cliente envía al consultar,
//               agendar, reprogramar y cambiar el estado de las citas.
// Depende de:   zod.
// Lo usa:       rutas/citas.ts (a través de validate y validateQuery).
//
// Una cita siempre dura 30 minutos y empieza en punto o y media, por eso el
// cliente solo envía el día (date) y la hora de inicio (time). La paciente, el
// médico y la sucursal se envían por su id. El paciente de una cita no se
// puede cambiar: se cancela y se agenda otra.
// =============================================================================
import { z } from 'zod';

// Fecha AAAA-MM-DD que además sea una fecha REAL (no 2026-02-31).
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'La fecha no existe');

// Hora de inicio 'HH:MM' en punto o y media.
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):(00|30)$/, 'Use el formato HH:MM, en punto o y media (ej.: 08:00 o 08:30)');

// Texto opcional: vacío o null significa "sin dato".
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max, `Máximo ${max} caracteres`).nullable(),
  );

const STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;

export const CreateAppointmentSchema = z.object({
  patient_id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  branch_id: z.string().uuid().optional(), // si no se indica, la sucursal activa
  date: dateSchema,
  time: timeSchema,
  reason: optionalText(500).optional(),
});

export const RescheduleAppointmentSchema = z
  .object({
    doctor_id: z.string().uuid().optional(),
    branch_id: z.string().uuid().optional(),
    date: dateSchema.optional(),
    time: timeSchema.optional(),
    reason: optionalText(500).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Indique al menos un campo para modificar',
  });

// Cambio de estado de una cita agendada. El motivo solo va con la cancelación.
export const ChangeAppointmentStatusSchema = z
  .object({
    status: z.enum(['cancelled', 'completed', 'no_show']),
    cancellation_reason: optionalText(500).optional(),
  })
  .refine((data) => data.status === 'cancelled' || data.cancellation_reason == null, {
    message: 'El motivo solo se acepta al cancelar',
    path: ['cancellation_reason'],
  });

// Consulta de la agenda (viene en la URL). Hay que acotar la búsqueda: un día
// (date), un rango de fechas (from y to, hasta 31 días) o un paciente.
const MAX_RANGE_DAYS = 31;
const dayCount = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

export const ListAppointmentsQuerySchema = z
  .object({
    date: dateSchema.optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    doctor_id: z.string().uuid().optional(),
    patient_id: z.string().uuid().optional(),
    branch_id: z.string().uuid().optional(),
    status: z.enum(STATUSES).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    page_size: z.coerce.number().int().min(1).max(200).default(50),
  })
  .superRefine((query, context) => {
    const hasRange = query.from !== undefined || query.to !== undefined;
    if (query.date !== undefined && hasRange) {
      context.addIssue({ code: 'custom', path: ['date'], message: 'Use "date" o bien "from" y "to", no ambos' });
      return;
    }
    if (hasRange && (query.from === undefined || query.to === undefined)) {
      context.addIssue({ code: 'custom', path: ['from'], message: 'Indique "from" y "to" juntos' });
      return;
    }
    if (query.from !== undefined && query.to !== undefined) {
      if (query.from > query.to) {
        context.addIssue({ code: 'custom', path: ['from'], message: 'La fecha "from" no puede ser posterior a "to"' });
      } else if (dayCount(query.from, query.to) > MAX_RANGE_DAYS) {
        context.addIssue({ code: 'custom', path: ['to'], message: `El rango no puede pasar de ${MAX_RANGE_DAYS} días` });
      }
    }
    if (query.date === undefined && !hasRange && query.patient_id === undefined) {
      context.addIssue({ code: 'custom', path: ['date'], message: 'Indique una fecha (date), un rango (from y to) o un paciente (patient_id)' });
    }
  });

export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;
export type RescheduleAppointmentInput = z.infer<typeof RescheduleAppointmentSchema>;
export type ChangeAppointmentStatusInput = z.infer<typeof ChangeAppointmentStatusSchema>;
export type ListAppointmentsQuery = z.infer<typeof ListAppointmentsQuerySchema>;
