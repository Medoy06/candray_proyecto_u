// =============================================================================
// usePaciente.ts
// Qué hace:     carga los datos de UN paciente (nombre, número de expediente...).
// Depende de:   ganchos/useCarga.ts y servicios/pacientes.ts.
// Lo usa:       paginas/expediente/PaginaExpediente.tsx.
// =============================================================================
import { getPatient } from '../servicios/pacientes';
import { useCarga } from './useCarga';

export function usePaciente(patientId: string) {
  return useCarga(() => getPatient(patientId), [patientId], 'No se pudo cargar al paciente.');
}
