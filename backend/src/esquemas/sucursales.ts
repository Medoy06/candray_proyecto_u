// =============================================================================
// sucursales.ts (esquema)
// Qué hace:     define la forma de lo que el cliente envía al administrar
//               sucursales (crear y modificar).
// Depende de:   zod.
// Lo usan:      rutas/sucursales.ts (a través de validate).
//
// El código de una sucursal (CENTRAL, ESCALON...) se elige al crearla y NO se
// puede modificar después: otros registros y reportes lo usan como referencia.
// Por eso UpdateBranchSchema no lo declara y Zod lo descarta si llega.
// =============================================================================
import { z } from 'zod';

// Hora en formato HH:MM de 24 horas (ej.: "08:00", "17:30").
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use el formato HH:MM (ej.: 08:00)');

// Color de acento en formato #RRGGBB.
const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use el formato #RRGGBB (ej.: #0F766E)');

// Texto opcional: vacío o null significa "sin dato".
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === '' ? null : value));

export const CreateBranchSchema = z.object({
  code: z
    .string()
    .regex(/^[A-Z0-9_]{2,20}$/, 'El código usa solo MAYÚSCULAS, números y guion bajo (2 a 20 caracteres)'),
  name: z.string().trim().min(2, 'El nombre es muy corto').max(255),
  address: optionalText(500).optional(),
  phone: optionalText(30).optional(),
  opening_time: timeSchema,
  closing_time: timeSchema,
  theme_color: colorSchema.default('#0F766E'),
  has_optical_counter: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export const UpdateBranchSchema = z
  .object({
    name: z.string().trim().min(2, 'El nombre es muy corto').max(255).optional(),
    address: optionalText(500).optional(),
    phone: optionalText(30).optional(),
    opening_time: timeSchema.optional(),
    closing_time: timeSchema.optional(),
    theme_color: colorSchema.optional(),
    has_optical_counter: z.boolean().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Indique al menos un campo para modificar',
  });

export type CreateBranchInput = z.infer<typeof CreateBranchSchema>;
export type UpdateBranchInput = z.infer<typeof UpdateBranchSchema>;
