// =============================================================================
// recetas.ts (esquema)
// Qué hace:     define la forma de lo que el cliente envía al emitir una receta
//               óptica o al reemplazar una: las medidas de cada ojo, la distancia
//               pupilar y una nota para el taller.
// Depende de:   zod y configuracion/negocio.ts (los límites).
// Lo usan:      rutas/recetas.ts (a través de validate).
//
// Quién la emite, en qué sucursal y cuándo NO se envía: sale del token. Zod
// descarta lo que el esquema no declara. Las reglas entre campos (un ojo con
// datos necesita esfera; el eje va si y solo si hay cilindro) se revisan al final
// con superRefine, para dar un mensaje por campo.
// =============================================================================
import { z } from 'zod';
import { PRESCRIPTION_LIMITS as LIMITS } from '../configuracion/negocio';

// Un número que va de cuarto en cuarto de dioptría (…, -0.25, 0, 0.25, …).
const quarterSteps = (min: number, max: number, label: string) =>
  z
    .number({ invalid_type_error: `${label} debe ser un número` })
    .min(min, `${label}: mínimo ${min}`)
    .max(max, `${label}: máximo ${max}`)
    .refine((value) => Math.abs(value * 4 - Math.round(value * 4)) < 1e-9, `${label} va de cuarto en cuarto (0.25)`)
    .nullish()
    .transform((value) => value ?? null);

const axis = z
  .number({ invalid_type_error: 'El eje debe ser un número' })
  .int('El eje debe ser un número entero')
  .min(LIMITS.axis.min, `El eje va de ${LIMITS.axis.min} a ${LIMITS.axis.max}`)
  .max(LIMITS.axis.max, `El eje va de ${LIMITS.axis.min} a ${LIMITS.axis.max}`)
  .nullish()
  .transform((value) => value ?? null);

const pupillaryDistance = z
  .number({ invalid_type_error: 'La distancia pupilar debe ser un número' })
  .min(LIMITS.pupillaryDistance.min, `La distancia pupilar va de ${LIMITS.pupillaryDistance.min} a ${LIMITS.pupillaryDistance.max}`)
  .max(LIMITS.pupillaryDistance.max, `La distancia pupilar va de ${LIMITS.pupillaryDistance.min} a ${LIMITS.pupillaryDistance.max}`)
  .refine((value) => Math.abs(value * 2 - Math.round(value * 2)) < 1e-9, 'La distancia pupilar va de medio en medio (0.5)')
  .nullish()
  .transform((value) => value ?? null);

const lensNotes = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(LIMITS.lensNotesMaxLength, `Máximo ${LIMITS.lensNotesMaxLength} caracteres`).nullish().transform((value) => value ?? null),
);

const prescriptionFields = {
  od_sphere: quarterSteps(LIMITS.sphere.min, LIMITS.sphere.max, 'La esfera del ojo derecho'),
  od_cylinder: quarterSteps(LIMITS.cylinder.min, LIMITS.cylinder.max, 'El cilindro del ojo derecho'),
  od_axis: axis,
  od_addition: quarterSteps(LIMITS.addition.min, LIMITS.addition.max, 'La adición del ojo derecho'),
  oi_sphere: quarterSteps(LIMITS.sphere.min, LIMITS.sphere.max, 'La esfera del ojo izquierdo'),
  oi_cylinder: quarterSteps(LIMITS.cylinder.min, LIMITS.cylinder.max, 'El cilindro del ojo izquierdo'),
  oi_axis: axis,
  oi_addition: quarterSteps(LIMITS.addition.min, LIMITS.addition.max, 'La adición del ojo izquierdo'),
  pupillary_distance: pupillaryDistance,
  lens_notes: lensNotes,
};

type Fields = {
  od_sphere: number | null; od_cylinder: number | null; od_axis: number | null; od_addition: number | null;
  oi_sphere: number | null; oi_cylinder: number | null; oi_axis: number | null; oi_addition: number | null;
};

// Reglas entre campos. Recibe los datos ya convertidos y el contexto de Zod.
function checkEyes(value: Fields, context: z.RefinementCtx): void {
  for (const [prefix, name] of [['od', 'derecho'], ['oi', 'izquierdo']] as const) {
    const sphere = value[`${prefix}_sphere`];
    const cylinder = value[`${prefix}_cylinder`];
    const eyeAxis = value[`${prefix}_axis`];
    const addition = value[`${prefix}_addition`];

    if (sphere === null && (cylinder !== null || eyeAxis !== null || addition !== null)) {
      context.addIssue({ code: 'custom', path: [`${prefix}_sphere`], message: `Indique la esfera del ojo ${name} (puede ser 0)` });
    }
    const needsAxis = cylinder !== null && cylinder !== 0;
    if (needsAxis && eyeAxis === null) {
      context.addIssue({ code: 'custom', path: [`${prefix}_axis`], message: `Indique el eje del ojo ${name}: tiene cilindro` });
    }
    if (!needsAxis && eyeAxis !== null) {
      context.addIssue({ code: 'custom', path: [`${prefix}_axis`], message: `El ojo ${name} no lleva eje sin cilindro` });
    }
  }
  if (value.od_sphere === null && value.oi_sphere === null) {
    context.addIssue({ code: 'custom', path: ['od_sphere'], message: 'Indique las medidas de al menos un ojo' });
  }
}

// Emitir: nace de la nota de una consulta.
export const IssuePrescriptionSchema = z
  .object({ record_id: z.string().uuid('La nota no es válida'), ...prescriptionFields })
  .superRefine(checkEyes);

// Reemplazar: las medidas completas de la receta nueva (la nota es la de la original).
export const ReplacePrescriptionSchema = z.object(prescriptionFields).superRefine(checkEyes);

export type IssuePrescriptionInput = z.infer<typeof IssuePrescriptionSchema>;
export type ReplacePrescriptionInput = z.infer<typeof ReplacePrescriptionSchema>;
