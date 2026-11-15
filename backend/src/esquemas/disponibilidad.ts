// =============================================================================
// disponibilidad.ts (esquema)
// Qué hace:     define los filtros de la consulta de disponibilidad (vienen en
//               la URL, como texto).
// Depende de:   zod.
// Lo usa:       rutas/disponibilidad.ts (a través de validateQuery).
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

export const AvailabilityQuerySchema = z.object({
  date: dateSchema,                          // el día que se quiere ver (obligatorio)
  branch_id: z.string().uuid().optional(),   // si no se indica, la sucursal activa
  doctor_id: z.string().uuid().optional(),   // si no se indica, todos los médicos
});

export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;
