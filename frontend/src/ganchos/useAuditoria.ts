// =============================================================================
// useAuditoria.ts
// Qué hace:     carga una página de la bitácora según los filtros y la página
//               pedida, y los valores para los desplegables de los filtros.
// Depende de:   ganchos/useCarga.ts y servicios/auditoria.ts.
// Lo usa:       paginas/auditoria/PaginaAuditoria.tsx.
//
// Si el rango de fechas está al revés (desde > hasta) NO se consulta al
// servidor (respondería 400): se devuelve una página vacía y la pantalla
// explica el problema.
// =============================================================================
import { getAuditFacets, listAudit, type AuditFilters, type AuditPage } from '../servicios/auditoria';
import { useCarga } from './useCarga';

const EMPTY_PAGE: AuditPage = { rows: [], pagination: { page: 1, page_size: 25, total: 0, total_pages: 0 } };

// ¿El rango de fechas es válido? (vacío en cualquiera de los lados también lo es)
export function isValidRange(filters: AuditFilters): boolean {
  return filters.from === '' || filters.to === '' || filters.from <= filters.to;
}

export function useAuditoria(filters: AuditFilters, page: number) {
  const entries = useCarga(
    () => (isValidRange(filters) ? listAudit(filters, page) : Promise.resolve(EMPTY_PAGE)),
    [filters.entity_type, filters.action, filters.from, filters.to, page],
    'No se pudo cargar la bitácora de auditoría.',
  );
  // Los desplegables se piden una sola vez; si fallan, quedan vacíos y la lista sigue funcionando.
  const facets = useCarga(getAuditFacets, [], 'No se pudieron cargar los filtros.');
  return { entries, facets: facets.data ?? { entity_types: [], actions: [] } };
}
