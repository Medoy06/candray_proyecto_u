// =============================================================================
// formularioInterconsulta.ts
// Qué hace:     la lógica SIN pantalla del formulario de interconsulta: valores,
//               validación y armado del cuerpo que se envía.
// Depende de:   configuracion/negocio.ts y servicios/interconsultas.ts (el tipo).
// Lo usa:       paginas/expediente/FormularioInterconsulta.tsx.
//
// Los límites son los del servidor; aquí se revisan antes para avisar sin
// esperar la respuesta, pero quien decide es el servidor.
// =============================================================================
import { REFERRAL_DEFAULT_DAYS, REFERRAL_MAX_DAYS } from '../../configuracion/negocio';
import type { GrantReferralInput } from '../../servicios/interconsultas';

export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 500;

export interface ReferralFormValues {
  providerId: string;
  reason: string;
  days: string; // texto, porque es lo que escribe la persona
}

export const EMPTY_REFERRAL_FORM: ReferralFormValues = {
  providerId: '',
  reason: '',
  days: String(REFERRAL_DEFAULT_DAYS),
};

// Devuelve el primer problema como mensaje, o '' si todo está bien.
export function validateReferralForm(values: ReferralFormValues): string {
  if (values.providerId === '') return 'Elija el médico que recibirá el acceso.';
  const reason = values.reason.trim();
  if (reason.length < REASON_MIN_LENGTH) return `Indique el motivo (mínimo ${REASON_MIN_LENGTH} caracteres).`;
  if (reason.length > REASON_MAX_LENGTH) return `El motivo no puede pasar de ${REASON_MAX_LENGTH} caracteres.`;
  const days = Number(values.days);
  if (values.days.trim() === '' || !Number.isInteger(days)) return 'Los días deben ser un número entero.';
  if (days < 1 || days > REFERRAL_MAX_DAYS) return `El acceso dura entre 1 y ${REFERRAL_MAX_DAYS} días.`;
  return '';
}

// El cuerpo que se envía al servidor.
export function buildGrantInput(values: ReferralFormValues): GrantReferralInput {
  return { provider_id: values.providerId, reason: values.reason.trim(), days: Number(values.days) };
}
