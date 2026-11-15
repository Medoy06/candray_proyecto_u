// =============================================================================
// citas.ts (servicio)
// Qué hace:     las llamadas a la API de citas y los tipos de sus datos.
// Depende de:   servicios/clienteApi.ts.
// Lo usan:      ganchos/useCitas.ts y paginas/citas/*.
// Requiere:     appointments_read para consultar; appointments_manage para
//               agendar y cambiar el estado (solo recepción). Los médicos solo
//               reciben sus propias citas.
//
// Las citas duran siempre 30 minutos. Las horas llegan como texto ya en hora
// de El Salvador ("AAAA-MM-DD HH:MM:SS").
// =============================================================================
import { api } from './clienteApi';

// Cuántas citas se piden por página (el servidor acepta hasta 200).
export const APPOINTMENT_PAGE_SIZE = 50;

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export interface Appointment {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_record_number: number;
  patient_phone: string;
  doctor_id: string;
  doctor_name: string;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  reason: string | null;
  cancellation_reason: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface AppointmentPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface AppointmentPage {
  rows: Appointment[];
  pagination: AppointmentPagination;
}

// Filtros de la agenda de un día. Un estado vacío ('') significa "todos".
export interface AppointmentFilters {
  date: string;              // AAAA-MM-DD
  branchId: string;          // la sucursal cuya agenda se ve
  status: AppointmentStatus | '';
}

// GET /api/citas — la agenda de un día en una sucursal. Solo se envía el estado si se eligió.
export async function listAppointments(filters: AppointmentFilters, page: number): Promise<AppointmentPage> {
  const params: Record<string, string | number> = {
    date: filters.date,
    branch_id: filters.branchId,
    page,
    page_size: APPOINTMENT_PAGE_SIZE,
  };
  if (filters.status !== '') params.status = filters.status;
  const response = await api.get<{ data: Appointment[]; pagination: AppointmentPagination }>('/citas', { params });
  return { rows: response.data.data, pagination: response.data.pagination };
}

// PATCH /api/citas/:id/estado — cancela (con motivo opcional), marca atendida o ausencia.
export async function changeAppointmentStatus(
  id: string,
  status: 'cancelled' | 'completed' | 'no_show',
  cancellationReason?: string | null,
): Promise<Appointment> {
  const body: { status: string; cancellation_reason?: string | null } = { status };
  if (status === 'cancelled' && cancellationReason !== undefined) body.cancellation_reason = cancellationReason;
  const response = await api.patch<{ data: Appointment }>(`/citas/${id}/estado`, body);
  return response.data.data;
}

// Lo que se envía al agendar una cita nueva (siempre en la sucursal activa).
export interface CreateAppointmentInput {
  patient_id: string;
  doctor_id: string;
  branch_id: string;
  date: string;          // AAAA-MM-DD
  time: string;          // HH:MM, en punto o y media
  reason: string | null;
}

// Lo que se envía al reprogramar: solo los campos que cambiaron.
export type RescheduleAppointmentInput = Partial<Pick<CreateAppointmentInput, 'doctor_id' | 'date' | 'time' | 'reason'>>;

// POST /api/citas — agenda una cita. Lanza 409 si el médico o el paciente ya tienen una a esa hora.
export async function createAppointment(input: CreateAppointmentInput): Promise<Appointment> {
  const response = await api.post<{ data: Appointment }>('/citas', input);
  return response.data.data;
}

// PATCH /api/citas/:id — cambia el médico, el día, la hora o el motivo de una cita programada.
export async function rescheduleAppointment(id: string, input: RescheduleAppointmentInput): Promise<Appointment> {
  const response = await api.patch<{ data: Appointment }>(`/citas/${id}`, input);
  return response.data.data;
}
