// =============================================================================
// franjas.ts (utilidad)
// Qué hace:     convierte un bloque de atención (08:00 a 12:00) en las franjas
//               de cita de 30 minutos que contiene (08:00, 08:30, ... 11:30).
// Depende de:   nada.
// Lo usa:       servicios/disponibilidad.ts.
//
// Son funciones puras (sin base de datos), por eso se prueban solas.
// =============================================================================

// Duración de una cita en minutos. Debe coincidir con la restricción de la
// tabla appointments (migración 05).
export const SLOT_MINUTES = 30;

// Convierte 'HH:MM' o 'HH:MM:SS' en minutos desde la medianoche.
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Convierte minutos desde la medianoche en 'HH:MM'.
export function toHourMinute(totalMinutes: number): string {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Lista las horas de inicio de las citas que caben en un bloque.
// Recibe: inicio y fin del bloque. Devuelve ['08:00', '08:30', ...]; una cita
// que no termina antes del cierre del bloque no cabe.
export function slotStartsInBlock(start: string, end: string): string[] {
  const slots: string[] = [];
  for (let minute = toMinutes(start); minute + SLOT_MINUTES <= toMinutes(end); minute += SLOT_MINUTES) {
    slots.push(toHourMinute(minute));
  }
  return slots;
}
