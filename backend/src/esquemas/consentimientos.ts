// =============================================================================
// consentimientos.ts (esquema)
// Qué hace:     define la forma de lo que el cliente envía al registrar un
//               consentimiento: solo una nota opcional ("cómo se obtuvo").
// Depende de:   zod.
// Lo usa:       rutas/consentimientos.ts (a través de validate).
//
// Quién lo registra y cuándo NO se envían: salen del token y del reloj del
// servidor. Una nota vacía o de solo espacios se guarda como null.
// =============================================================================
import { z } from 'zod';

export const CONSENT_NOTE_MAX_LENGTH = 200;

export const GrantConsentSchema = z.object({
  note: z
    .string()
    .trim()
    .max(CONSENT_NOTE_MAX_LENGTH, `Máximo ${CONSENT_NOTE_MAX_LENGTH} caracteres`)
    .nullish()
    .transform((value) => (value === undefined || value === null || value === '' ? null : value)),
});

export type GrantConsentInput = z.infer<typeof GrantConsentSchema>;
