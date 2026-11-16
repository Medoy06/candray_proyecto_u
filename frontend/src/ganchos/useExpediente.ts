// =============================================================================
// useExpediente.ts
// Qué hace:     carga una página del expediente de un paciente y la recarga
//               cuando cambia el paciente o la página, o con reload().
// Depende de:   ganchos/useCarga.ts y servicios/expedientes.ts.
// Lo usa:       paginas/expediente/PaginaExpediente.tsx.
//
// Ojo: cada carga es una LECTURA del expediente y queda en la bitácora. Por eso
// solo se recarga cuando hace falta (otra página, o después de guardar algo).
// =============================================================================
import { listRecords } from '../servicios/expedientes';
import { useCarga } from './useCarga';

export function useExpediente(patientId: string, page: number) {
  return useCarga(() => listRecords(patientId, page), [patientId, page], 'No se pudo cargar el expediente.');
}
