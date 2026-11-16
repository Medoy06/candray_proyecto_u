// =============================================================================
// DetalleOrden.tsx
// Qué hace:     la ventana con todo lo de una orden de óptica: el pedido, el
//               dinero, la receta que se debe fabricar, la historia de estados y
//               los botones para avanzarla o cancelarla.
// Depende de:   componentes/ui, ganchos/useCarga.ts, servicios/ordenesOptica.ts,
//               servicios/recetas.ts y paginas/expediente/MedidasReceta.tsx.
// Lo usa:       paginas/ordenes/PaginaOrdenesOptica.tsx.
//
// Pide al servidor la orden con su historia y, si la persona puede ver recetas,
// las medidas de la receta vinculada. Esa lectura exige el consentimiento del
// paciente: si se revocó después de la venta, aquí se muestra el aviso del
// servidor en lugar de las medidas (la orden no guarda una copia de ellas).
// No avanza ni cancela por sí misma: avisa a la página, que confirma y llama
// al servidor (un diálogo de confirmación no se abre desde dentro de otra ventana).
// =============================================================================
import { Boton } from '../../componentes/ui/Boton';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { Etiqueta } from '../../componentes/ui/Etiqueta';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { useCarga } from '../../ganchos/useCarga';
import { getOpticalOrder, type OpticalOrder, type OpticalOrderDetail } from '../../servicios/ordenesOptica';
import { listOpticalPrescriptions } from '../../servicios/recetas';
import { formatDateTime } from '../../utilidades/formatoFecha';
import { formatMoney } from '../../utilidades/formatoMoneda';
import { MedidasReceta } from '../expediente/MedidasReceta';
import { NEXT_STEPS, STATUS_LABELS, STATUS_TONES, canCancel, type NextStep } from './etiquetasOrdenes';

interface DetalleOrdenProps {
  order: OpticalOrder;            // la fila de la lista: sirve mientras llega el detalle
  canManage: boolean;             // puede avanzar y cancelar
  canSeePrescription: boolean;    // puede leer recetas (prescriptions_read)
  onClose: () => void;
  onAdvance: (order: OpticalOrderDetail, step: NextStep) => void;
  onCancel: (order: OpticalOrderDetail) => void;
}

// Una línea "nombre: valor" del detalle.
function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-texto-suave">{label}</dt>
      <dd className="text-sm text-texto">{children}</dd>
    </div>
  );
}

export function DetalleOrden({ order, canManage, canSeePrescription, onClose, onAdvance, onCancel }: DetalleOrdenProps) {
  const detail = useCarga(() => getOpticalOrder(order.id), [order.id], 'No se pudo cargar la orden.');
  const prescriptions = useCarga(
    () => (canSeePrescription ? listOpticalPrescriptions(order.patient_id) : Promise.resolve(null)),
    [order.patient_id, canSeePrescription],
    'No se pudo cargar la receta.',
  );

  // Mientras llega el detalle se muestra lo que ya se sabe por la lista.
  const shown: OpticalOrder = detail.data ?? order;
  const loaded = detail.data;
  const next = NEXT_STEPS[shown.status];
  const prescription = prescriptions.data?.rows.find((row) => row.id === shown.prescription_id) ?? null;
  const open = canCancel(shown.status);

  return (
    <ModalShell
      title="Orden de óptica"
      badge={<Etiqueta tone={STATUS_TONES[shown.status]}>{STATUS_LABELS[shown.status]}</Etiqueta>}
      size="2xl"
      onClose={onClose}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Cerrar
          </Boton>
          {canManage && loaded !== null && open && (
            <Boton variant="peligro" onClick={() => onCancel(loaded)}>
              Cancelar orden
            </Boton>
          )}
          {canManage && loaded !== null && next !== undefined && (
            <Boton variant="primario" onClick={() => onAdvance(loaded, next)}>
              {next.button}
            </Boton>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {detail.status === 'error' && <AlertaError message={detail.error ?? 'No se pudo cargar la orden.'} />}

        {!shown.prescription_is_current && open && (
          <p role="status" className="rounded-md bg-aviso-fondo px-3 py-2 text-sm text-aviso-texto">
            El médico reemplazó la receta de esta orden después de la venta. Revise con el paciente antes de seguir.
          </p>
        )}

        <dl className="grid gap-3 sm:grid-cols-2">
          <Dato label="Paciente">
            {shown.patient_name} · Expediente {shown.patient_record_number}
          </Dato>
          <Dato label="Sucursal">{shown.branch_name}</Dato>
          <Dato label="Armazón">{shown.frame_description}</Dato>
          <Dato label="Lentes">{shown.lens_description}</Dato>
          <Dato label="Total">{formatMoney(shown.total_amount)}</Dato>
          <Dato label="Anticipo">{formatMoney(shown.deposit_amount)}</Dato>
          <Dato label="Saldo">{formatMoney(shown.balance)}</Dato>
          <Dato label="Registrada por">
            {shown.created_by_name}, el {formatDateTime(shown.created_at)}
          </Dato>
          {shown.notes !== null && <Dato label="Notas">{shown.notes}</Dato>}
          {shown.cancellation_reason !== null && <Dato label="Motivo de la cancelación">{shown.cancellation_reason}</Dato>}
        </dl>

        {canSeePrescription && (
          <section aria-label="Receta de la orden">
            <h3 className="mb-2 text-sm font-semibold text-titulo">Receta</h3>
            {prescriptions.status === 'loading' && prescriptions.data === null && (
              <p className="text-sm text-texto-suave">Cargando receta...</p>
            )}
            {prescriptions.status === 'error' && <AlertaError message={prescriptions.error ?? 'No se pudo cargar la receta.'} />}
            {prescriptions.status === 'ready' && prescription !== null && (
              <>
                <p className="mb-2 text-sm text-texto-suave">
                  Emitida el {formatDateTime(prescription.created_at)} por {prescription.doctor_name}.
                </p>
                <MedidasReceta measures={prescription} />
              </>
            )}
            {prescriptions.status === 'ready' && prescription === null && (
              <p className="text-sm text-texto-suave">
                {shown.prescription_is_current
                  ? 'No se encontró la receta de esta orden.'
                  : 'Esa receta ya no está vigente, por eso no se muestra.'}
              </p>
            )}
          </section>
        )}

        <section aria-label="Historia de la orden">
          <h3 className="mb-2 text-sm font-semibold text-titulo">Historia</h3>
          {detail.status === 'loading' && loaded === null && <p className="text-sm text-texto-suave">Cargando historia...</p>}
          {loaded !== null && (
            <ol className="space-y-1">
              {loaded.events.map((event) => (
                <li key={event.id} className="text-sm text-texto">
                  <span className="font-medium">{event.from_status === null ? 'Creada' : STATUS_LABELS[event.to_status]}</span>
                  <span className="text-texto-suave">
                    {' '}
                    · {event.changed_by_name}, {formatDateTime(event.created_at)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </ModalShell>
  );
}
