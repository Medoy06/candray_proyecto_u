// =============================================================================
// recetas.ts (servicio)
// Qué hace:     las llamadas a la API de recetas ópticas y los tipos de sus datos.
// Depende de:   servicios/clienteApi.ts.
// Lo usan:      ganchos/useRecetas.ts y paginas/expediente/*.
// Requiere:     prescriptions_read para leer; prescriptions_author para emitir y
//               reemplazar (solo médicos). El servidor además exige que el médico
//               haya atendido al paciente (o, para leer, tenga una interconsulta).
//
// Una receta no se edita ni se borra: no existen llamadas para eso. Corregirla es
// emitir otra que la reemplaza. Las medidas llegan como números.
// =============================================================================
import { api } from './clienteApi';

// Lo que el médico escribe en una receta: las medidas de cada ojo (OD = derecho,
// OI = izquierdo), la distancia pupilar y una nota para el taller.
export interface PrescriptionMeasures {
  od_sphere: number | null;
  od_cylinder: number | null;
  od_axis: number | null;
  od_addition: number | null;
  oi_sphere: number | null;
  oi_cylinder: number | null;
  oi_axis: number | null;
  oi_addition: number | null;
  pupillary_distance: number | null;
  lens_notes: string | null;
}

export interface Prescription extends PrescriptionMeasures {
  id: string;
  patient_id: string;
  doctor_id: string;
  doctor_name: string;
  branch_id: string;
  branch_name: string;
  record_id: string;            // la nota de la consulta de la que sale
  supersedes_id: string | null; // la receta que esta reemplaza; nulo en la primera
  created_at: string;
  is_current: boolean;          // false = ya la reemplazó otra
}

// Por qué la persona puede ver las recetas de este paciente.
// 'consent' es la óptica: ve solo las vigentes y gracias al consentimiento del paciente.
export type PrescriptionAccess = 'role' | 'appointment' | 'referral' | 'consent';

export interface PrescriptionList {
  rows: Prescription[];
  access: PrescriptionAccess;
}

// Lo que se envía al emitir: la nota de la que sale y las medidas.
export interface IssuePrescriptionInput extends PrescriptionMeasures {
  record_id: string;
}

// GET /api/pacientes/:id/recetas — todas, la más reciente primero.
// Cada lectura queda en la bitácora. Lanza 403 si no se tiene acceso al paciente.
export async function listPrescriptions(patientId: string): Promise<PrescriptionList> {
  const response = await api.get<{ data: Prescription[]; access: PrescriptionAccess }>(
    `/pacientes/${patientId}/recetas`,
  );
  return { rows: response.data.data, access: response.data.access };
}

// POST /api/pacientes/:id/recetas — emite la receta de una consulta.
// Lanza 409 si esa consulta ya tiene su receta.
export async function issuePrescription(patientId: string, input: IssuePrescriptionInput): Promise<Prescription> {
  const response = await api.post<{ data: Prescription }>(`/pacientes/${patientId}/recetas`, input);
  return response.data.data;
}

// POST /api/pacientes/:id/recetas/:receta/reemplazos — emite una receta nueva que
// reemplaza a otra. Lanza 409 si esa receta ya fue reemplazada.
export async function replacePrescription(
  patientId: string,
  prescriptionId: string,
  input: PrescriptionMeasures,
): Promise<Prescription> {
  const response = await api.post<{ data: Prescription }>(
    `/pacientes/${patientId}/recetas/${prescriptionId}/reemplazos`,
    input,
  );
  return response.data.data;
}

// Lo que ve la óptica de una receta: las medidas y la nota del taller, nada más.
// (El administrador recibe la receta completa, que también cumple esta forma.)
export type OpticalPrescription = PrescriptionMeasures &
  Pick<Prescription, 'id' | 'created_at' | 'doctor_name' | 'is_current'>;

export interface OpticalPrescriptionList {
  rows: OpticalPrescription[];
  access: PrescriptionAccess;
}

// GET /api/pacientes/:id/recetas, leída por la óptica. Es la misma llamada que
// listPrescriptions; aquí solo cambia el tipo, porque la óptica recibe menos campos.
// Lanza 403 si el paciente no tiene un consentimiento vigente.
export async function listOpticalPrescriptions(patientId: string): Promise<OpticalPrescriptionList> {
  const response = await api.get<{ data: OpticalPrescription[]; access: PrescriptionAccess }>(
    `/pacientes/${patientId}/recetas`,
  );
  return { rows: response.data.data, access: response.data.access };
}
