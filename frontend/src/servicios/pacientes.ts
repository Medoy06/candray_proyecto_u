// =============================================================================
// pacientes.ts (servicio)
// Qué hace:     las llamadas a la API de pacientes y los tipos de sus datos.
// Depende de:   servicios/clienteApi.ts.
// Lo usan:      ganchos/usePacientes.ts y paginas/pacientes/*.
// Requiere:     patients_search para consultar; patients_manage para registrar,
//               editar y desactivar (solo recepción).
//
// El número de expediente lo asigna la base de datos: no se envía ni se cambia.
// =============================================================================
import { api } from './clienteApi';

// Cuántos pacientes se piden por página (el servidor acepta de 1 a 100).
export const PATIENT_PAGE_SIZE = 25;

// Un paciente tal como lo entrega la API.
export interface Patient {
  id: string;
  record_number: number;
  full_name: string;
  birth_date: string; // "AAAA-MM-DD" (texto, sin zona horaria)
  phone: string;
  dui: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PatientPagination {
  page: number;
  page_size: number;
  total: number;       // pacientes que cumplen la búsqueda, en todas las páginas
  total_pages: number;
}

export interface PatientPage {
  rows: Patient[];
  pagination: PatientPagination;
}

export interface PatientFilters {
  search: string;           // nombre, teléfono, DUI o número de expediente ('' = sin buscar)
  includeInactive: boolean; // true = incluye a los pacientes desactivados
}

export const EMPTY_PATIENT_FILTERS: PatientFilters = { search: '', includeInactive: false };

// Lo que se envía al registrar un paciente. DUI y correo vacíos se mandan como null.
export interface CreatePatientInput {
  full_name: string;
  birth_date: string;
  phone: string;
  dui: string | null;
  email: string | null;
}

// Lo que se envía al editar: solo los campos que cambiaron.
export type UpdatePatientInput = Partial<CreatePatientInput> & { is_active?: boolean };

// GET /api/pacientes — una página de resultados. Solo se envían los filtros con valor.
export async function listPatients(filters: PatientFilters, page: number): Promise<PatientPage> {
  const params: Record<string, string | number> = { page, page_size: PATIENT_PAGE_SIZE };
  if (filters.search !== '') params.q = filters.search;
  if (filters.includeInactive) params.include_inactive = 'true';
  const response = await api.get<{ data: Patient[]; pagination: PatientPagination }>('/pacientes', { params });
  return { rows: response.data.data, pagination: response.data.pagination };
}

// POST /api/pacientes — registra un paciente. Lanza 409 si el DUI ya existe.
export async function createPatient(input: CreatePatientInput): Promise<Patient> {
  const response = await api.post<{ data: Patient }>('/pacientes', input);
  return response.data.data;
}

// PATCH /api/pacientes/:id — modifica solo lo enviado (también activa o desactiva).
export async function updatePatient(id: string, input: UpdatePatientInput): Promise<Patient> {
  const response = await api.patch<{ data: Patient }>(`/pacientes/${id}`, input);
  return response.data.data;
}
