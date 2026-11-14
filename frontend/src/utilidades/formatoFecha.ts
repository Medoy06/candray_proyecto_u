// =============================================================================
// formatoFecha.ts
// Qué hace:     formatDate / formatDateTime / formatTime: escriben fechas y
//               horas al estilo de El Salvador (13/11/2026, 14:05).
// Depende de:   configuracion/negocio.ts.
// Lo usan:      toda pantalla que muestre fechas (auditoría, citas, órdenes...).
//
// Por qué NO se usa new Date("2026-11-13 14:05:00"):
// la base guarda las horas YA en hora de El Salvador, sin zona horaria, y las
// entrega como texto. new Date() interpretaría ese texto en la zona del
// navegador y podría correr la hora (o hasta el día). Aquí se leen los números
// del texto tal cual y se formatean sin conversión de zona.
//
// Formatos que acepta: "2026-11-13", "2026-11-13 14:05:00", "2026-11-13T14:05:00"
// (con o sin segundos y fracciones) y solo hora "08:00" o "08:00:00".
// =============================================================================
import { LOCALE } from '../configuracion/negocio';

// Texto que se muestra cuando no hay fecha (vacía o inválida).
const NO_VALUE = '—';

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC', // sin conversión: los números ya son la hora local del negocio
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false, // 24 horas: no hay confusión entre a. m. y p. m.
});

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

// Convierte los números del texto en un Date "en UTC" solo para poder
// formatearlo; no representa un instante real. Devuelve null si no es válido
// (incluye fechas imposibles como 2026-02-31: JavaScript las "desborda" al mes
// siguiente, y por eso basta comparar año y mes para detectarlas).
function toDate(year: number, month: number, day: number, hour = 0, minute = 0): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    hour < 24 &&
    minute < 60;
  return valid ? date : null;
}

// Interpreta un texto de fecha (con o sin hora). Devuelve null si no es válido.
function parseDateText(text: string): { date: Date; hasTime: boolean } | null {
  const match = DATE_PATTERN.exec(text.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  const date = toDate(Number(y), Number(mo), Number(d), Number(h ?? 0), Number(mi ?? 0));
  return date ? { date, hasTime: h !== undefined } : null;
}

// Fecha sola: "13/11/2026". Si el texto trae hora, la ignora.
export function formatDate(value: string | null | undefined): string {
  const parsed = value ? parseDateText(value) : null;
  return parsed ? dateFormat.format(parsed.date) : NO_VALUE;
}

// Fecha y hora: "13/11/2026 14:05". Si el texto no trae hora, devuelve solo la fecha.
export function formatDateTime(value: string | null | undefined): string {
  const parsed = value ? parseDateText(value) : null;
  if (!parsed) return NO_VALUE;
  const date = dateFormat.format(parsed.date);
  return parsed.hasTime ? `${date} ${timeFormat.format(parsed.date)}` : date;
}

// Hora sola: "08:00". Acepta "08:00:00" (columnas time de la base) o una fecha con hora.
export function formatTime(value: string | null | undefined): string {
  if (!value) return NO_VALUE;
  const onlyTime = TIME_PATTERN.exec(value.trim());
  if (onlyTime) {
    const date = toDate(2000, 1, 1, Number(onlyTime[1]), Number(onlyTime[2]));
    return date ? timeFormat.format(date) : NO_VALUE;
  }
  const parsed = parseDateText(value);
  return parsed?.hasTime ? timeFormat.format(parsed.date) : NO_VALUE;
}
