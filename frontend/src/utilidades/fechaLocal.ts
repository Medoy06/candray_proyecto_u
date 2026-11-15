// =============================================================================
// fechaLocal.ts
// Qué hace:     tres ayudas para trabajar con días escritos como "AAAA-MM-DD":
//               la fecha de hoy, sumar o restar días y el nombre del día de la
//               semana.
// Depende de:   configuracion/negocio.ts (idioma).
// Lo usan:      el formulario de pacientes y la pantalla de citas.
//
// Igual que formatoFecha.ts, nunca se hace new Date("2026-11-15"): ese texto se
// leería en la zona del navegador y podría correr el día. Aquí los días se
// calculan en UTC con los números del texto, sin conversión de zona.
// La única excepción es todayText, que SÍ necesita el reloj del navegador.
// =============================================================================
import { LOCALE } from '../configuracion/negocio';

const weekdayFormat = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', weekday: 'long' });

// La fecha de hoy según el reloj de este navegador, como "AAAA-MM-DD".
// `now` se puede indicar para las pruebas.
export function todayText(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// Suma (o resta, con negativos) días a una fecha "AAAA-MM-DD".
export function addDays(text: string, days: number): string {
  const [year, month, day] = text.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// El día de la semana de una fecha "AAAA-MM-DD": "domingo", "lunes"...
export function weekdayName(text: string): string {
  const [year, month, day] = text.split('-').map(Number);
  return weekdayFormat.format(new Date(Date.UTC(year, month - 1, day)));
}
