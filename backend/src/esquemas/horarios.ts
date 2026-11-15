// =============================================================================
// horarios.ts (esquema)
// Qué hace:     define la forma de lo que el cliente envía al administrar los
//               bloques del horario semanal de los médicos.
// Depende de:   zod.
// Lo usa:       rutas/horarios.ts (a través de validate y validateQuery).
//
// Un bloque es "el médico X atiende en la sucursal Y los <día> de <hora> a
// <hora>". Las horas son en punto o y media, porque las citas duran 30 minutos.
// El médico de un bloque no se puede cambiar: se borra el bloque y se crea otro.
// =============================================================================
import { z } from 'zod';

// Hora 'HH:MM' en punto o y media (ej.: "08:00", "13:30").
const slotTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):(00|30)$/, 'Use el formato HH:MM, en punto o y media (ej.: 08:00 o 08:30)');

// Día de la semana ISO: 1 = lunes ... 7 = domingo.
const weekdaySchema = z.number().int().min(1, 'El día va de 1 (lunes) a 7 (domingo)').max(7, 'El día va de 1 (lunes) a 7 (domingo)');

export const CreateScheduleSchema = z.object({
  doctor_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  weekday: weekdaySchema,
  start_time: slotTimeSchema,
  end_time: slotTimeSchema,
});

export const UpdateScheduleSchema = z
  .object({
    branch_id: z.string().uuid().optional(),
    weekday: weekdaySchema.optional(),
    start_time: slotTimeSchema.optional(),
    end_time: slotTimeSchema.optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Indique al menos un campo para modificar',
  });

// Filtros de la lista (vienen en la URL).
export const ListSchedulesQuerySchema = z.object({
  doctor_id: z.string().uuid().optional(),
  branch_id: z.string().uuid().optional(),
});

export type CreateScheduleInput = z.infer<typeof CreateScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof UpdateScheduleSchema>;
export type ListSchedulesQuery = z.infer<typeof ListSchedulesQuerySchema>;
