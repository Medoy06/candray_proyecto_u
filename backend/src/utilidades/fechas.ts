// =============================================================================
// fechas.ts (utilidad)
// Qué hace:     funciones para trabajar con fechas "de calendario" (AAAA-MM-DD)
//               en la hora de El Salvador, sin depender de la zona horaria del
//               servidor.
// Depende de:   configuracion/negocio.ts (TIME_ZONE).
// Lo usan:      los esquemas y servicios que comparan una fecha con "hoy".
// =============================================================================
import { TIME_ZONE } from '../configuracion/negocio';

// Devuelve la fecha de hoy en El Salvador como 'AAAA-MM-DD'.
// El formato "en-CA" (Canadá) es el único que escribe la fecha como año-mes-día.
export function todayInElSalvador(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}
