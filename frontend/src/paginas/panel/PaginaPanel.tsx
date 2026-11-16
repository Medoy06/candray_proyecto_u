// =============================================================================
// PaginaPanel.tsx
// Qué hace:     el panel de indicadores: los números del día de cada sucursal que
//               la persona puede ver y, si son varias, también el total.
// Depende de:   ganchos/usePanel.ts, componentes/ui y paginas/panel/BloqueIndicadores.tsx.
// Lo usa:       navegacion/RutasAplicacion.tsx (ruta "panel", capacidad dashboard_read).
//
// Es solo lectura y no tiene datos de pacientes: solo conteos y dinero. Los
// números llegan calculados del servidor, incluso el total.
// =============================================================================
import { AlertaError } from '../../componentes/ui/AlertaError';
import { Boton } from '../../componentes/ui/Boton';
import { EncabezadoPagina } from '../../componentes/ui/EncabezadoPagina';
import { Tarjeta } from '../../componentes/ui/Tarjeta';
import { usePanel } from '../../ganchos/usePanel';
import { formatDate } from '../../utilidades/formatoFecha';
import { BloqueIndicadores } from './BloqueIndicadores';

export function PaginaPanel() {
  const { status, data, error, reload } = usePanel();

  return (
    <div>
      <EncabezadoPagina
        title="Panel de indicadores"
        description={
          data === null
            ? 'Números de las sucursales. No incluye datos de pacientes.'
            : `Números al ${formatDate(data.as_of)}. No incluye datos de pacientes.`
        }
      />

      {status === 'error' && (
        <div className="space-y-3">
          <AlertaError message={error ?? 'No se pudo cargar el panel de indicadores.'} />
          <Boton variant="secundario" onClick={reload}>
            Reintentar
          </Boton>
        </div>
      )}
      {status === 'loading' && data === null && <p className="text-sm text-texto-suave">Cargando indicadores...</p>}
      {data !== null && data.branches.length === 0 && (
        <p className="rounded-lg border border-borde bg-superficie p-6 text-center text-sm text-texto-suave">
          No hay sucursales activas para mostrar.
        </p>
      )}
      {data !== null && data.branches.length > 0 && (
        <div className="space-y-4">
          {data.branches.length > 1 && (
            <Tarjeta title="Todas las sucursales">
              <BloqueIndicadores indicators={data.totals} />
            </Tarjeta>
          )}
          {data.branches.map((branch) => (
            <Tarjeta key={branch.branch_id} title={branch.branch_name}>
              <BloqueIndicadores indicators={branch} />
            </Tarjeta>
          ))}
        </div>
      )}
    </div>
  );
}
