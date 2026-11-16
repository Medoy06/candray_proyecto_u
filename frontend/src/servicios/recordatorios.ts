// =============================================================================
// recordatorios.ts (servicio)
// Qué hace:     la llamada a la API de la bandeja de recordatorios y el tipo de
//               cada recordatorio.
// Depende de:   servicios/clienteApi.ts.
// Lo usan:      ganchos/useRecordatorios.ts y paginas/recordatorios/*.
// Requiere:     la capacidad reminders_read (recepción y administrador).
//
// Los recordatorios son una SIMULACIÓN: el servidor solo dice qué citas
// necesitarían uno (hoy y mañana en la sucursal activa); no se envía nada. La
// hora llega como texto ya en hora de El Salvador ("AAAA-MM-DD HH:MM:SS").
// =============================================================================
import { api } from './clienteApi';

export interface Reminder {
  appointment_id: string;
  starts_at: string;
  patient_name: string;
  patient_phone: string;
  doctor_name: string;
  branch_name: string;
}

// Las citas de hoy y mañana a las que se les enviaría un recordatorio.
export async function listReminders(): Promise<Reminder[]> {
  const response = await api.get<{ data: Reminder[] }>('/recordatorios');
  return response.data.data;
}
