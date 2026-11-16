// =============================================================================
// useInterconsultas.ts
// Qué hace:     carga las interconsultas de un paciente y las recarga con reload().
// Depende de:   ganchos/useCarga.ts y servicios/interconsultas.ts.
// Lo usa:       paginas/expediente/SeccionInterconsultas.tsx.
// =============================================================================
import { listReferrals } from '../servicios/interconsultas';
import { useCarga } from './useCarga';

export function useInterconsultas(patientId: string) {
  return useCarga(() => listReferrals(patientId), [patientId], 'No se pudieron cargar las interconsultas.');
}
