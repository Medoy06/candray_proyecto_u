// =============================================================================
// useOrdenesOptica.ts
// Qué hace:     carga una página de órdenes de óptica según los filtros y la
//               página pedida, y la recarga cuando cambian o con reload().
// Depende de:   ganchos/useCarga.ts y servicios/ordenesOptica.ts.
// Lo usa:       paginas/ordenes/PaginaOrdenesOptica.tsx.
// =============================================================================
import { listOpticalOrders, type OpticalOrderFilters } from '../servicios/ordenesOptica';
import { useCarga } from './useCarga';

export function useOrdenesOptica(filters: OpticalOrderFilters, page: number) {
  return useCarga(
    () => listOpticalOrders(filters, page),
    [filters.branchId, filters.status, page],
    'No se pudieron cargar las órdenes de óptica.',
  );
}
