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
