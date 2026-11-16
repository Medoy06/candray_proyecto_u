// =============================================================================
// TablaOrdenes.tsx
// Qué hace:     define las columnas de la lista de órdenes (fecha, paciente,
//               pedido, total, estado y acciones) y las dibuja con la tabla
//               genérica.
// Depende de:   componentes/ui, paginas/ordenes/etiquetasOrdenes.ts,
//               servicios/ordenesOptica.ts y utilidades de formato.
// Lo usa:       paginas/ordenes/PaginaOrdenesOptica.tsx.
//
// No decide nada: avisa a la página cuando se pulsa "Ver". Todo lo que se hace
// con una orden (avanzarla, cancelarla) se hace desde su detalle. Una orden
// cuya receta fue reemplazada después de la venta lleva una etiqueta de aviso.
// =============================================================================
import { Boton } from '../../componentes/ui/Boton';
import { Etiqueta } from '../../componentes/ui/Etiqueta';
import { Tabla, type TablaColumna } from '../../componentes/ui/Tabla';
import type { OpticalOrder } from '../../servicios/ordenesOptica';
import { formatDate } from '../../utilidades/formatoFecha';
import { formatMoney } from '../../utilidades/formatoMoneda';
import { STATUS_LABELS, STATUS_TONES, canCancel } from './etiquetasOrdenes';

interface TablaOrdenesProps {
  orders: OpticalOrder[];
  onView: (order: OpticalOrder) => void;
}

export function TablaOrdenes({ orders, onView }: TablaOrdenesProps) {
  const columns: TablaColumna<OpticalOrder>[] = [
    { id: 'date', header: 'Fecha', noWrap: true, cell: (order) => formatDate(order.created_at) },
    {
      id: 'patient',
      header: 'Paciente',
      cell: (order) => (
        <>
          <p className="font-medium text-texto">{order.patient_name}</p>
          <p className="text-xs text-texto-suave">Expediente {order.patient_record_number}</p>
        </>
      ),
    },
    {
      id: 'items',
      header: 'Pedido',
      cell: (order) => (
        <>
          <p>{order.frame_description}</p>
          <p className="text-xs text-texto-suave">{order.lens_description}</p>
        </>
      ),
    },
    {
      id: 'total',
      header: 'Total',
      noWrap: true,
      cell: (order) => (
        <>
          <p>{formatMoney(order.total_amount)}</p>
          <p className="text-xs text-texto-suave">
            {order.balance > 0 ? `Saldo ${formatMoney(order.balance)}` : 'Sin saldo'}
          </p>
        </>
      ),
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (order) => (
        <div className="space-y-1">
          <Etiqueta tone={STATUS_TONES[order.status]}>{STATUS_LABELS[order.status]}</Etiqueta>
          {!order.prescription_is_current && canCancel(order.status) && (
            <p>
              <Etiqueta tone="aviso">Receta reemplazada</Etiqueta>
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Acciones',
      align: 'right',
      cell: (order) => (
        <Boton size="sm" onClick={() => onView(order)} aria-label={`Ver la orden de ${order.patient_name}`}>
          Ver
        </Boton>
      ),
    },
  ];

  return <Tabla label="Órdenes de óptica" columns={columns} rows={orders} rowKey={(order) => order.id} />;
}
