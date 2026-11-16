// =============================================================================
// negocio.ts (configuración del frontend)
// Qué hace:     constantes de formato del negocio: moneda, idioma y zona horaria.
// Requerimiento: dólares estadounidenses y formato de El Salvador (sección 2).
// Lo usan:      utilidades/formatoMoneda.ts y utilidades/formatoFecha.ts.
//
// Son las mismas de backend/src/configuracion/negocio.ts. Se repiten aquí
// porque el frontend es un proyecto aparte; si una cambia, cambie la otra.
// =============================================================================

// Moneda de todo el sistema: dólar estadounidense (moneda oficial de El Salvador).
export const CURRENCY = 'USD';

// Idioma y país para formatear números y fechas (El Salvador, español).
export const LOCALE = 'es-SV';

// Zona horaria del negocio (UTC-6, sin horario de verano).
export const TIME_ZONE = 'America/El_Salvador';

// Longitud mínima de una contraseña. Igual a MIN_PASSWORD_LENGTH del backend.
export const MIN_PASSWORD_LENGTH = 8;

// Interconsulta: cuántos días dura el acceso que un médico le da a otro si no
// indica otra cosa, y el máximo permitido. Iguales a REFERRAL_DEFAULT_DAYS y
// REFERRAL_MAX_DAYS del backend.
export const REFERRAL_DEFAULT_DAYS = 14;
export const REFERRAL_MAX_DAYS = 30;

// Consentimiento: cuánto puede medir la nota de "cómo se obtuvo". Igual a
// CONSENT_NOTE_MAX_LENGTH del backend.
export const CONSENT_NOTE_MAX_LENGTH = 200;
