// =============================================================================
// PaginaOrdenesOptica.tsx
// Qué hace:     la lista de órdenes de óptica de la sucursal activa: quién compró,
//               qué se pidió, cuánto falta por pagar y en qué estado va. La óptica
//               puede crear una orden nueva, abrir el detalle de una, enviarla al
//               taller, marcarla como lista, entregarla o cancelarla.
// Depende de:   ganchos/useOrdenesOptica.ts, useSesion.ts, componentes/ui y los
//               componentes de esta carpeta.
// Lo usa:       navegacion/RutasAplicacion.tsx (ruta "ordenes-optica", capacidad
//               optical_orders_read).
//
// Igual que las demás páginas, esta es la "directora": guarda el filtro, la
// página, qué ventana está abierta y qué aviso se muestra. Quien solo puede ver
// (optical_orders_read sin optical_orders_manage) no ve ningún botón de cambio.
// No hay "eliminar": una orden cancelada queda en la lista con su motivo.
// =============================================================================
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { AlertaExito } from '../../componentes/ui/AlertaExito';
import { Boton } from '../../componentes/ui/Boton';
import { ConfirmDialog } from '../../componentes/ui/ConfirmDialog';
import { EncabezadoPagina } from '../../componentes/ui/EncabezadoPagina';
import { Paginacion } from '../../componentes/ui/Paginacion';
import { useOrdenesOptica } from '../../ganchos/useOrdenesOptica';
import { useSesion } from '../../ganchos/useSesion';
import {
  changeOpticalOrderStatus,
  type OpticalOrder,
  type OpticalOrderDetail,
  type OpticalOrderStatus,
} from '../../servicios/ordenesOptica';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { DetalleOrden } from './DetalleOrden';
import { STATUS_LABELS, type NextStep } from './etiquetasOrdenes';
import { FiltrosOrdenes } from './FiltrosOrdenes';
import { FormularioCancelarOrden } from './FormularioCancelarOrden';
import { FormularioOrden } from './FormularioOrden';
import { TablaOrdenes } from './TablaOrdenes';

export function PaginaOrdenesOptica() {
  const { can, activeBranch } = useSesion();
  const canManage = can('optical_orders_manage');
  const [status, setStatus] = useState<OpticalOrderStatus | ''>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<OpticalOrder | null>(null);
  const [advancing, setAdvancing] = useState<{ order: OpticalOrder; step: NextStep } | null>(null);
  const [cancelling, setCancelling] = useState<OpticalOrder | null>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const { status: loadStatus, data, error, reload } = useOrdenesOptica(
    { branchId: activeBranch?.id ?? '', status },
    page,
  );

  if (activeBranch === null) return null;

  function changeStatusFilter(next: OpticalOrderStatus | '') {
    setStatus(next);
    setPage(1);
  }

  // Abre una ventana limpiando los avisos anteriores.
  function open<T>(setter: (value: T) => void, value: T) {
    setNotice('');
    setActionError('');
    setter(value);
  }

  // Desde el detalle: se cierra y se pide confirmar el paso (un diálogo de
  // confirmación no se abre desde dentro de otra ventana).
  function askAdvance(order: OpticalOrderDetail, step: NextStep) {
    setViewing(null);
    open(setAdvancing, { order, step });
  }

  function askCancel(order: OpticalOrderDetail) {
    setViewing(null);
    open(setCancelling, order);
  }

  async function confirmAdvance() {
    const target = advancing;
    if (target === null) return;
    setAdvancing(null); // se cierra de inmediato: evita un doble clic
    setNotice('');
    try {
      await changeOpticalOrderStatus(target.order.id, target.step.to);
      setActionError('');
      setNotice(`La orden de ${target.order.patient_name} pasó a "${STATUS_LABELS[target.step.to]}".`);
      reload();
    } catch (changeError: unknown) {
      setActionError(getApiErrorMessage(changeError, 'No se pudo cambiar el estado de la orden.'));
    }
  }

  const empty = data !== null && data.rows.length === 0 && loadStatus !== 'error';

  return (
    <div>
      <EncabezadoPagina
        title="Órdenes de óptica"
        description={`Ventas de lentes de ${activeBranch.name}, de la más reciente a la más antigua.`}
      />

      {notice !== '' && (
        <div className="mb-4">
          <AlertaExito message={notice} onClose={() => setNotice('')} />
        </div>
      )}
      {actionError !== '' && (
        <div className="mb-4">
          <AlertaError message={actionError} />
        </div>
      )}

      {canManage && (
        <div className="mb-4 flex justify-end">
          <Boton variant="primario" onClick={() => open(setCreating, true)}>
            <Plus className="size-4" aria-hidden="true" />
            Nueva orden
          </Boton>
        </div>
      )}

      <FiltrosOrdenes status={status} onStatusChange={changeStatusFilter} />

      {loadStatus === 'error' && (
        <div className="space-y-3">
          <AlertaError message={error ?? 'No se pudieron cargar las órdenes de óptica.'} />
          <Boton variant="secundario" onClick={reload}>
            Reintentar
          </Boton>
        </div>
      )}
      {loadStatus === 'loading' && data === null && <p className="text-sm text-texto-suave">Cargando órdenes...</p>}
      {empty && (
        <p className="rounded-lg border border-borde bg-superficie p-6 text-center text-sm text-texto-suave">
          {status === '' ? 'Todavía no hay órdenes en esta sucursal.' : 'No hay órdenes con ese estado.'}
        </p>
      )}
      {data !== null && data.rows.length > 0 && (
        <>
          <TablaOrdenes orders={data.rows} onView={(order) => open(setViewing, order)} />
          <Paginacion
            page={data.pagination.page}
            totalPages={data.pagination.total_pages}
            total={data.pagination.total}
            noun="órdenes"
            disabled={loadStatus === 'loading'}
            onPageChange={setPage}
          />
        </>
      )}

      {creating && (
        <FormularioOrden
          onClose={() => setCreating(false)}
          onSaved={(saved) => {
            setCreating(false);
            setActionError('');
            setNotice(`Orden creada para ${saved.patient_name}.`);
            // La nueva orden está pendiente y es la más reciente: se muestra en la primera página, sin filtro.
            if (status === '' && page === 1) reload();
            else {
              setStatus('');
              setPage(1);
            }
          }}
        />
      )}
      {viewing !== null && (
        <DetalleOrden
          order={viewing}
          canManage={canManage}
          canSeePrescription={can('prescriptions_read')}
          onClose={() => setViewing(null)}
          onAdvance={askAdvance}
          onCancel={askCancel}
        />
      )}
      {cancelling !== null && (
        <FormularioCancelarOrden
          order={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={(saved) => {
            setCancelling(null);
            setActionError('');
            setNotice(`Se canceló la orden de ${saved.patient_name}.`);
            reload();
          }}
        />
      )}
      <ConfirmDialog
        isOpen={advancing !== null}
        title={advancing?.step.button ?? ''}
        message={advancing === null ? '' : `Orden de ${advancing.order.patient_name}. ${advancing.step.confirm} No se podrá deshacer.`}
        confirmLabel={advancing?.step.button ?? ''}
        onConfirm={() => void confirmAdvance()}
        onCancel={() => setAdvancing(null)}
      />
    </div>
  );
}
