// =============================================================================
// interconsultas.ts (esquema)
// Qué hace:     define la forma de lo que el cliente envía al dar una
//               interconsulta.
// Depende de:   zod y configuracion/negocio.ts (duración por defecto y máxima).
// Lo usa:       rutas/interconsultas.ts (a través de validate).
//
// Quién concede la interconsulta NO se envía: sale del token. La fecha de
// vencimiento tampoco: la calcula el servidor a partir de "days", para que un
// cliente no pueda pedir un acceso sin fin.
// =============================================================================
import { z } from 'zod';
import { REFERRAL_DEFAULT_DAYS, REFERRAL_MAX_DAYS } from '../configuracion/negocio';

export const GrantReferralSchema = z.object({
  provider_id: z.string().uuid('El médico no es válido'),
  reason: z.string().trim().min(3, 'Indique el motivo (mínimo 3 caracteres)').max(500, 'Máximo 500 caracteres'),
  days: z
    .number({ invalid_type_error: 'Los días deben ser un número' })
    .int('Los días deben ser un número entero')
    .min(1, 'Mínimo 1 día')
    .max(REFERRAL_MAX_DAYS, `Máximo ${REFERRAL_MAX_DAYS} días`)
    .default(REFERRAL_DEFAULT_DAYS),
});

export type GrantReferralInput = z.infer<typeof GrantReferralSchema>;
