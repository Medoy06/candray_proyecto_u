// =============================================================================
// useHorarios.ts
// Qué hace:     carga los bloques de horario de un médico y los vuelve a cargar
//               cuando cambia el médico o con reload().
// Depende de:   ganchos/useCarga.ts y servicios/horarios.ts.
// Lo usa:       paginas/horarios/PaginaHorarios.tsx.
// =============================================================================
import { listSchedules } from '../servicios/horarios';
import { useCarga } from './useCarga';

// doctorId vacío = todavía no hay médico elegido: no se pide nada.
export function useHorarios(doctorId: string) {
  return useCarga(
    () => (doctorId === '' ? Promise.resolve([]) : listSchedules(doctorId)),
    [doctorId],
    'No se pudieron cargar los horarios.',
  );
}
