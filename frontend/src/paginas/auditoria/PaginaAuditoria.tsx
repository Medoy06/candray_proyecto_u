// =============================================================================
// PaginaAuditoria.tsx
// Qué hace:     la pantalla de la bitácora de auditoría: quién hizo qué y
//               cuándo, con filtros y páginas de 25 registros.
// Depende de:   ganchos/useAuditoria.ts, componentes/ui y los componentes de
//               esta carpeta.
// Lo usa:       navegacion/RutasAplicacion.tsx (ruta "auditoria", capacidad
//               audit_read).
//
// Solo lectura. Igual que las otras páginas, esta es la "directora": guarda los
// filtros y la página actual; la tabla y los filtros son "tontos".
// Al cambiar un filtro se vuelve a la página 1 (la página 7 de una búsqueda
// distinta podría no existir).
// =============================================================================
import { useState } from 'react';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { Boton } from '../../componentes/ui/Boton';
import { EncabezadoPagina } from '../../componentes/ui/EncabezadoPagina';
import { Paginacion } from '../../componentes/ui/Paginacion';
import { isValidRange, useAuditoria } from '../../ganchos/useAuditoria';
import { EMPTY_AUDIT_FILTERS, type AuditFilters } from '../../servicios/auditoria';
import { FiltrosAuditoria } from './FiltrosAuditoria';
import { TablaAuditoria } from './TablaAuditoria';

export function PaginaAuditoria() {
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [page, setPage] = useState(1);
  const { entries, facets } = useAuditoria(filters, page);
  const { status, data, error, reload } = entries;

  const rangeOk = isValidRange(filters);
  const hasFilters = Object.values(filters).some((filter) => filter !== '');

  function changeFilters(next: AuditFilters) {
    setFilters(next);
    setPage(1);
  }

  return (
    <div>
      <EncabezadoPagina title="Auditoría" description="Quién hizo qué y cuándo. Lo más reciente aparece primero." />

      <FiltrosAuditoria value={filters} facets={facets} onChange={changeFilters} />

      {!rangeOk && <AlertaError message="La fecha “Desde” no puede ser posterior a “Hasta”." />}

      {rangeOk && status === 'error' && (
        <div className="space-y-3">
          <AlertaError message={error ?? 'No se pudo cargar la bitácora de auditoría.'} />
          <Boton variant="secundario" onClick={reload}>
            Reintentar
          </Boton>
        </div>
      )}
      {rangeOk && status === 'loading' && data === null && <p className="text-sm text-texto-suave">Cargando bitácora...</p>}
      {rangeOk && data !== null && data.rows.length === 0 && status !== 'error' && (
        <p className="rounded-lg border border-borde bg-superficie p-6 text-center text-sm text-texto-suave">
          {hasFilters ? 'No hay registros con esos filtros.' : 'Todavía no hay registros en la bitácora.'}
        </p>
      )}
      {rangeOk && data !== null && data.rows.length > 0 && (
        <>
          <TablaAuditoria entries={data.rows} />
          <Paginacion
            page={data.pagination.page}
            totalPages={data.pagination.total_pages}
            total={data.pagination.total}
            noun="registros"
            disabled={status === 'loading'}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
