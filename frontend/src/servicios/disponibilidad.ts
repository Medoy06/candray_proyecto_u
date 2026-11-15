// =============================================================================
// disponibilidad.ts (servicio)
// Qué hace:     pide al servidor qué médicos atienden un día en una sucursal y
//               cuáles de sus franjas de 30 minutos están libres.
// Depende de:   servicios/clienteApi.ts.
// Lo usan:      ganchos/useDisponibilidad.ts y paginas/citas/*.
// Requiere:     capacidad availability_read (médicos y recepción).
//
// Cada franja viene con su estado: libre, ocupada, o ya pasada (no se puede
// agendar en el pasado). El servidor decide el estado; aquí solo se muestra.
// =============================================================================
import { api } from './clienteApi';

export type SlotStatus = 'free' | 'booked' | 'past';

export interface Slot {
  time: string; // "HH:MM"
  status: SlotStatus;
}

export interface DoctorAvailability {
  doctor_id: string;
  doctor_name: string;
  blocks: { start_time: string; end_time: string }[];
  slots: Slot[];
  free_count: number;
}

export interface DayAvailability {
  date: string;
  branch_id: string;
  weekday: number;
  doctors: DoctorAvailability[];
}

// GET /api/disponibilidad — todos los médicos que atienden ese día en la sucursal.
export async function getAvailability(date: string, branchId: string): Promise<DayAvailability> {
  const response = await api.get<{ data: DayAvailability }>('/disponibilidad', {
    params: { date, branch_id: branchId },
  });
  return response.data.data;
}
