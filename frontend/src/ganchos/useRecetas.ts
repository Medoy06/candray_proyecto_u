// =============================================================================
// useRecetas.ts
// Qué hace:     carga las recetas de un paciente y las recarga con reload().
//               Con enabled en false no pide nada (quien no puede leer recetas
//               no debe provocar una lectura ni una negativa en la bitácora).
// Depende de:   ganchos/useCarga.ts y servicios/recetas.ts.
// Lo usa:       paginas/expediente/PaginaExpediente.tsx.
//
// Ojo: cada carga es una LECTURA de las recetas y queda en la bitácora. Por eso
// solo se recarga después de emitir o reemplazar una.
// =============================================================================
import { listPrescriptions, type PrescriptionList } from '../servicios/recetas';
import { useCarga } from './useCarga';

export function useRecetas(patientId: string, enabled: boolean) {
  return useCarga<PrescriptionList | null>(
    () => (enabled ? listPrescriptions(patientId) : Promise.resolve(null)),
    [patientId, enabled],
    'No se pudieron cargar las recetas.',
  );
}
