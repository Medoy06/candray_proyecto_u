// =============================================================================
// negocio.ts
// Qué hace:     reúne las constantes de negocio del sistema en un solo lugar,
//               para que ningún archivo tenga "números mágicos" repartidos.
// Requerimiento: IVA incluido (sección 9), bloqueo de cuenta (sección 8),
//               formato del DUI (sección 2) y moneda/zona horaria (sección 3).
// Depende de:   nada.
// Lo usan:      el bloqueo de cuenta, el cálculo de IVA, la validación del DUI,
//               la emisión de tokens y los formateadores de moneda y fecha.
//
// Estas constantes NO son secretos ni dependen del entorno; si algo debe poder
// cambiar entre instalaciones (puerto, claves), va en entorno.ts.
// =============================================================================

// --- Moneda, idioma y hora -------------------------------------------------
// El Salvador está dolarizado: toda transacción es en dólares estadounidenses.
export const CURRENCY = 'USD';

// Idioma y región para dar formato a números y fechas (ej.: $1,250.50).
export const LOCALE = 'es-SV';

// Zona horaria de El Salvador: UTC-6 todo el año, sin horario de verano.
export const TIME_ZONE = 'America/El_Salvador';

// --- Impuesto ---------------------------------------------------------------
// Porcentaje de IVA, como entero (13 %). Los precios del catálogo ya lo
// incluyen. Se guarda como entero y no como 0.13 para calcular con centavos
// enteros y evitar errores de redondeo de decimales binarios.
export const VAT_PERCENT = 13;

// --- Bloqueo de cuenta ------------------------------------------------------
// Tras este número de intentos fallidos SEGUIDOS la cuenta se bloquea...
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

// ...durante este número de minutos.
export const ACCOUNT_LOCK_MINUTES = 15;

// --- Sesión y contraseñas ---------------------------------------------------
// Duración del token de sesión (formato de la librería jsonwebtoken).
export const JWT_EXPIRES_IN = '8h';

// Largo mínimo de una contraseña nueva.
export const MIN_PASSWORD_LENGTH = 8;

// --- Peticiones -------------------------------------------------------------
// Tamaño máximo del cuerpo de una petición JSON. Limita cuánta información
// puede enviar un atacante y reduce el riesgo del aviso de Zod sobre arreglos
// enormes (ver docs/decisiones/001-auditoria-dependencias.md).
export const JSON_BODY_LIMIT = '100kb';

// --- Documento de identidad -------------------------------------------------
// DUI salvadoreño: 8 dígitos, un guion y 1 dígito de verificación.
// Ejemplo válido: 01234567-8. Solo se comprueba el formato, no el dígito.
export const DUI_PATTERN = /^\d{8}-\d$/;
