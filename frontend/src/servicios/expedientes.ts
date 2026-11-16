// =============================================================================
// expedientes.ts (servicio)
// Qué hace:     las llamadas a la API del expediente clínico y los tipos de sus
//               datos.
// Depende de:   servicios/clienteApi.ts.
// Lo usan:      ganchos/useExpediente.ts y paginas/expediente/*.
// Requiere:     medical_records_read para leer; medical_records_author para
//               escribir y enmendar (solo médicos). Además el servidor exige
//               que el médico haya atendido al paciente o tenga una
//               interconsulta vigente.
//
// El expediente solo se agrega: no existen llamadas para editar ni borrar una
// nota. Corregir una nota es crear una enmienda nueva.
// Las horas llegan como texto ya en hora de El Salvador ("AAAA-MM-DD HH:MM:SS").
// =============================================================================
import { api } from './clienteApi';

// Cuántas entradas se piden por página (el servidor acepta hasta 200).
export const RECORD_PAGE_SIZE = 20;

// Una entrada del expediente: una nota de consulta o una enmienda.
export interface RecordEntry {
  id: string;
  patient_id: string;
  doctor_id: string;
  doctor_name: string;
  branch_id: string;
  branch_name: string;
  appointment_id: string | null;        // nulo en una enmienda
  appointment_starts_at: string | null; // cuándo fue la consulta; nulo en una enmienda
  amends_id: string | null;             // la nota que corrige; nulo en una nota original
  diagnosis: string;
  treatment: string | null;
  notes: string | null;
  created_at: string;
  amendment_count: number;              // cuántas enmiendas tiene esta nota
}

// Por qué la persona puede ver este expediente.
export type RecordAccess =
  | { reason: 'role' }                          // administrador (solo lectura)
  | { reason: 'appointment' }                   // tiene o tuvo una cita con el paciente
  | { reason: 'referral'; expiresAt: string };  // interconsulta vigente (solo lectura)

export interface RecordPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface RecordPage {
  rows: RecordEntry[];
  access: RecordAccess;
  pagination: RecordPagination;
}

// Una consulta del médico que todavía no tiene su nota.
export interface PendingConsultation {
  id: string;
  starts_at: string;
  branch_name: string;
  reason: string | null;
}

// Lo que se envía al escribir la nota de una consulta. Tratamiento y notas vacíos van como null.
export interface CreateNoteInput {
  appointment_id: string;
  diagnosis: string;
  treatment: string | null;
  notes: string | null;
}

// Lo que se envía al enmendar: el contenido completo corregido.
export interface AmendNoteInput {
  diagnosis: string;
  treatment: string | null;
  notes: string | null;
}

// GET /api/pacientes/:id/expediente — una página del historial, de todas las sucursales.
// Cada lectura queda en la bitácora. Lanza 403 si no se tiene acceso al paciente.
export async function listRecords(patientId: string, page: number): Promise<RecordPage> {
  const response = await api.get<{ data: RecordEntry[]; access: RecordAccess; pagination: RecordPagination }>(
    `/pacientes/${patientId}/expediente`,
    { params: { page, page_size: RECORD_PAGE_SIZE } },
  );
  return { rows: response.data.data, access: response.data.access, pagination: response.data.pagination };
}

// GET /api/pacientes/:id/expediente/pendientes — consultas del médico sin nota.
export async function listPendingConsultations(patientId: string): Promise<PendingConsultation[]> {
  const response = await api.get<{ data: PendingConsultation[] }>(`/pacientes/${patientId}/expediente/pendientes`);
  return response.data.data;
}

// POST /api/pacientes/:id/expediente — escribe la nota de una consulta.
// Lanza 409 si esa consulta ya tiene nota.
export async function createNote(patientId: string, input: CreateNoteInput): Promise<RecordEntry> {
  const response = await api.post<{ data: RecordEntry }>(`/pacientes/${patientId}/expediente`, input);
  return response.data.data;
}

// POST /api/pacientes/:id/expediente/:nota/enmiendas — agrega una enmienda a una nota.
export async function amendNote(patientId: string, recordId: string, input: AmendNoteInput): Promise<RecordEntry> {
  const response = await api.post<{ data: RecordEntry }>(
    `/pacientes/${patientId}/expediente/${recordId}/enmiendas`,
    input,
  );
  return response.data.data;
}
