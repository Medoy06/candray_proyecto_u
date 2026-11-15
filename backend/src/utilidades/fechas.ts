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

// Devuelve la fecha y la hora actuales en El Salvador como 'AAAA-MM-DD HH:MM'.
// Con ese formato, dos horas se pueden comparar como texto (la menor va primero).
// El formato "sv-SE" (sueco) escribe año-mes-día y hora de 24 horas.
export function nowInElSalvador(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
    .format(new Date())
    .replace(',', '');
}

// Día de la semana ISO de una fecha 'AAAA-MM-DD': 1 = lunes ... 7 = domingo.
// Coincide con extract(isodow ...) de PostgreSQL y con doctor_schedules.weekday.
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return day === 0 ? 7 : day;
}
