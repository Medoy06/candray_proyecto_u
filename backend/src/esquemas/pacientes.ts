// =============================================================================
// pacientes.ts (esquema)
// Qué hace:     define la forma de lo que el cliente envía al buscar, registrar
//               y modificar pacientes.
// Depende de:   zod y configuracion/negocio.ts (formato del DUI).
// Lo usan:      rutas/pacientes.ts (a través de validate y validateQuery).
//
// El número de expediente (record_number) lo asigna la base de datos y no se
// puede enviar ni cambiar: no aparece en ningún esquema, y Zod descarta lo que
// el esquema no declara.
// =============================================================================
import { z } from 'zod';
import { DUI_PATTERN } from '../configuracion/negocio';

// Fecha AAAA-MM-DD que además sea REAL (no 2026-02-31) y desde 1900, igual que
// la restricción de la base. Que no sea futura lo revisa el servicio.
const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'La fecha no existe')
  .refine((value) => value >= '1900-01-01', 'La fecha de nacimiento es demasiado antigua');

// Teléfono: dígitos, espacios, guion, paréntesis y +. Así se rechazan letras.
const phoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9+() -]{8,30}$/, 'El teléfono debe tener entre 8 y 30 caracteres: números, espacios, guion, + o paréntesis');

// Un texto vacío o null significa "sin dato" en los campos opcionales.
const emptyToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);

const duiSchema = z.preprocess(
  emptyToNull,
  z.string().trim().regex(DUI_PATTERN, 'El DUI debe tener el formato 01234567-8').nullable(),
);

const emailSchema = z.preprocess(
  emptyToNull,
  z.string().trim().toLowerCase().email('El correo no es válido').max(255).nullable(),
);

const fullNameSchema = z.string().trim().min(2, 'El nombre es muy corto').max(255);

export const CreatePatientSchema = z.object({
  full_name: fullNameSchema,
  birth_date: birthDateSchema,
  phone: phoneSchema,
  dui: duiSchema.optional(),
  email: emailSchema.optional(),
});

export const UpdatePatientSchema = z
  .object({
    full_name: fullNameSchema.optional(),
    birth_date: birthDateSchema.optional(),
    phone: phoneSchema.optional(),
    dui: duiSchema.optional(),
    email: emailSchema.optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Indique al menos un campo para modificar',
  });

// Búsqueda (viene en la URL, como texto). `q` busca por nombre (varias palabras,
// sin importar tildes ni mayúsculas), teléfono, DUI o número de expediente.
export const SearchPatientsQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  include_inactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreatePatientInput = z.infer<typeof CreatePatientSchema>;
export type UpdatePatientInput = z.infer<typeof UpdatePatientSchema>;
export type SearchPatientsQuery = z.infer<typeof SearchPatientsQuerySchema>;
