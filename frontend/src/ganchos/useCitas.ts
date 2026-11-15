// =============================================================================
// useCitas.ts
// Qué hace:     carga una página de la agenda de un día según los filtros y la
//               página pedida, y la recarga cuando cambian o con reload().
// Depende de:   ganchos/useCarga.ts y servicios/citas.ts.
// Lo usa:       paginas/citas/PaginaCitas.tsx.
// =============================================================================
import { listAppointments, type AppointmentFilters } from '../servicios/citas';
import { useCarga } from './useCarga';

export function useCitas(filters: AppointmentFilters, page: number) {
  return useCarga(
    () => listAppointments(filters, page),
    [filters.date, filters.branchId, filters.status, page],
    'No se pudo cargar la agenda de citas.',
  );
}
