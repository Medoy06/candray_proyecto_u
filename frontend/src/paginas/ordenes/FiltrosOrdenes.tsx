// =============================================================================
// FiltrosOrdenes.tsx
// Qué hace:     la barra de la lista de órdenes: elegir qué estado se quiere ver
//               (o todos).
// Depende de:   componentes/ui, paginas/ordenes/etiquetasOrdenes.ts y
//               servicios/ordenesOptica.ts.
// Lo usa:       paginas/ordenes/PaginaOrdenesOptica.tsx.
//
// Es un componente "tonto": no consulta nada; solo avisa lo que la persona elige.
// =============================================================================
import { FormField, inputClass } from '../../componentes/ui/FormField';
import type { OpticalOrderStatus } from '../../servicios/ordenesOptica';
import { STATUS_LABELS, STATUS_ORDER } from './etiquetasOrdenes';

interface FiltrosOrdenesProps {
  status: OpticalOrderStatus | '';
  onStatusChange: (status: OpticalOrderStatus | '') => void;
}

export function FiltrosOrdenes({ status, onStatusChange }: FiltrosOrdenesProps) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <FormField label="Estado">
        <select
          className={inputClass}
          value={status}
          onChange={(event) => onStatusChange(event.target.value as OpticalOrderStatus | '')}
        >
          <option value="">Todos</option>
          {STATUS_ORDER.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </FormField>
    </div>
  );
}
