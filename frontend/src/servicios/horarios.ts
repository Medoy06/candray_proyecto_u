// =============================================================================
// horarios.ts (servicio)
// Qué hace:     las llamadas a la API de horarios de los médicos y el tipo de
//               un bloque de horario.
// Depende de:   servicios/clienteApi.ts.
// Lo usan:      ganchos/useHorarios.ts y paginas/horarios/*.
// Requiere:     la capacidad availability_read para listar y schedules_manage
//               para crear, cambiar o eliminar.
//
// Un bloque es un tramo de la semana en que un médico atiende en una sucursal
// (por ejemplo, los lunes de 08:00 a 12:00 en Candray Central).
// =============================================================================
import { api } from './clienteApi';

export interface ScheduleBlock {
  id: string;
  doctor_id: string;
  doctor_name: string;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  weekday: number;      // 1 = lunes ... 7 = domingo
  start_time: string;   // "HH:MM:SS"
  end_time: string;     // "HH:MM:SS"
  created_at: string;
}

// Lo que se envía al crear un bloque. Las horas van como "HH:MM", en punto o y media.
export interface CreateScheduleInput {
  doctor_id: string;
  branch_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

// Al cambiar un bloque se envía solo lo que cambió.
export interface UpdateScheduleInput {
  branch_id?: string;
  weekday?: number;
  start_time?: string;
  end_time?: string;
}

// GET /api/horarios?doctor_id= — los bloques de un médico.
export async function listSchedules(doctorId: string): Promise<ScheduleBlock[]> {
  const response = await api.get<{ data: ScheduleBlock[] }>('/horarios', { params: { doctor_id: doctorId } });
  return response.data.data;
}

// POST /api/horarios — crea un bloque. Responde 409 si se cruza con otro del médico.
export async function createSchedule(input: CreateScheduleInput): Promise<ScheduleBlock> {
  const response = await api.post<{ data: ScheduleBlock }>('/horarios', input);
  return response.data.data;
}

// PATCH /api/horarios/:id — cambia un bloque. Responde 409 si dejaría citas sin cubrir.
export async function updateSchedule(id: string, input: UpdateScheduleInput): Promise<ScheduleBlock> {
  const response = await api.patch<{ data: ScheduleBlock }>(`/horarios/${id}`, input);
  return response.data.data;
}

// DELETE /api/horarios/:id — elimina un bloque. Responde 409 si hay citas futuras en él.
export async function deleteSchedule(id: string): Promise<void> {
  await api.delete(`/horarios/${id}`);
}
