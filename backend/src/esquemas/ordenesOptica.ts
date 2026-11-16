// =============================================================================
// ordenesOptica.ts (esquema)
// Qué hace:     define la forma de lo que el cliente envía al crear una orden de
//               óptica, al cambiar su estado y al consultar la lista.
// Depende de:   zod y configuracion/negocio.ts (los límites).
// Lo usan:      rutas/ordenesOptica.ts (a través de validate y validateQuery).
//
// El paciente, la sucursal y quién la registra NO se envían: el paciente sale de
// la receta, y los otros dos del token y de la sucursal activa. Zod descarta lo
// que el esquema no declara.
// =============================================================================
import { z } from 'zod';
import { OPTICAL_ORDER_LIMITS as LIMITS } from '../configuracion/negocio';

// Texto opcional: vacío o null significa "sin dato".
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max, `Máximo ${max} caracteres`).nullable(),
  );

// Texto obligatorio, sin espacios sobrantes en los lados.
const requiredText = (label: string, max: number) =>
  z
    .string({ required_error: `${label} es obligatorio`, invalid_type_error: `${label} es obligatorio` })
    .trim()
    .min(1, `${label} es obligatorio`)
    .max(max, `${label}: máximo ${max} caracteres`);

// Dinero: número con a lo más dos decimales (centavos).
const money = (label: string, min: number) =>
  z
    .number({ required_error: `${label} es obligatorio`, invalid_type_error: `${label} debe ser un número` })
    .min(min, min === 0 ? `${label} no puede ser negativo` : `${label} debe ser mayor que cero`)
    .max(LIMITS.maxAmount, `${label}: máximo ${LIMITS.maxAmount}`)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, `${label} lleva a lo más dos decimales`);

export const CreateOpticalOrderSchema = z
  .object({
    prescription_id: z.string({ required_error: 'La receta es obligatoria' }).uuid('La receta no es válida'),
    frame_description: requiredText('El armazón', LIMITS.descriptionMaxLength),
    lens_description: requiredText('Los lentes', LIMITS.descriptionMaxLength),
    total_amount: money('El total', 0.01),
    deposit_amount: money('El anticipo', 0).default(0),
    notes: optionalText(LIMITS.notesMaxLength).optional(),
  })
  .superRefine((data, context) => {
    if (data.deposit_amount > data.total_amount) {
      context.addIssue({ code: 'custom', path: ['deposit_amount'], message: 'El anticipo no puede pasar del total' });
    }
  })
  .transform((data) => ({ ...data, notes: data.notes ?? null }));

// Cambio de estado. El motivo es obligatorio al cancelar y no se acepta en los demás.
export const ChangeOpticalOrderStatusSchema = z
  .object({
    status: z.enum(['in_lab', 'ready', 'delivered', 'cancelled'], {
      errorMap: () => ({ message: 'Estado no válido' }),
    }),
    reason: optionalText(LIMITS.reasonMaxLength).optional(),
  })
  .superRefine((data, context) => {
    if (data.status === 'cancelled' && !data.reason) {
      context.addIssue({ code: 'custom', path: ['reason'], message: 'Indique el motivo de la cancelación' });
    }
    if (data.status !== 'cancelled' && data.reason) {
      context.addIssue({ code: 'custom', path: ['reason'], message: 'El motivo solo se acepta al cancelar' });
    }
  })
  .transform((data) => ({ status: data.status, reason: data.reason ?? null }));

// Consulta de la lista (viene en la URL).
export const ListOpticalOrdersQuerySchema = z.object({
  status: z.enum(['pending', 'in_lab', 'ready', 'delivered', 'cancelled']).optional(),
  patient_id: z.string().uuid().optional(),
  branch_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateOpticalOrderInput = z.infer<typeof CreateOpticalOrderSchema>;
export type ChangeOpticalOrderStatusInput = z.infer<typeof ChangeOpticalOrderStatusSchema>;
export type ListOpticalOrdersQuery = z.infer<typeof ListOpticalOrdersQuerySchema>;
