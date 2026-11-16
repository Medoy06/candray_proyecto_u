// =============================================================================
// recordatorios.ts (servicio)
// Qué hace:     decide qué citas entran en la bandeja de recordatorios: las
//               agendadas de la sucursal activa, de ahora hasta el final de
//               mañana (hoy y mañana).
// Requerimiento: capacidad reminders_read (bandeja de recordatorios simulados).
// Depende de:   modelos/recordatorios.ts y utilidades/fechas.ts.
// Lo usa:       controladores/recordatorios.ts.
//
// Los recordatorios son una SIMULACIÓN: no se guarda nada ni se envía ningún
// mensaje; la lista se calcula con las citas de cada momento.
// =============================================================================
import { listUpcomingReminders, type Reminder } from '../modelos/recordatorios';
import { nowInElSalvador, todayInElSalvador } from '../utilidades/fechas';

// Suma días a una fecha 'AAAA-MM-DD' sin pasar por la zona horaria del servidor.
function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

// Citas de la sucursal que deberían recibir su recordatorio (hoy y mañana).
export async function getReminders(branchId: string): Promise<Reminder[]> {
  return listUpcomingReminders(branchId, nowInElSalvador(), addDays(todayInElSalvador(), 2));
}
