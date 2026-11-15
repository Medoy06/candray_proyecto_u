// =============================================================================
// FiltrosAuditoria.tsx
// Qué hace:     la barra de filtros de la bitácora: tipo, acción, fecha desde y
//               fecha hasta, y un botón para quitar todos los filtros.
// Depende de:   servicios/auditoria.ts, etiquetasAuditoria.ts y componentes/ui.
// Lo usa:       paginas/auditoria/PaginaAuditoria.tsx.
//
// Componente "tonto": muestra los valores que le pasa la página y avisa cuando
// cambia alguno. Los desplegables muestran el nombre en español pero guardan el
// código que entiende el servidor (value).
// =============================================================================
import { Boton } from '../../componentes/ui/Boton';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { EMPTY_AUDIT_FILTERS, type AuditFacets, type AuditFilters } from '../../servicios/auditoria';
import { actionLabel, entityLabel } from './etiquetasAuditoria';

// Límites de los campos de fecha. Sin un máximo, el navegador deja escribir años
// de hasta 6 dígitos (275760); con max="9999-12-31" el año queda en 4 dígitos.
const MIN_DATE = '2000-01-01';
const MAX_DATE = '9999-12-31';

interface FiltrosAuditoriaProps {
  value: AuditFilters;
  facets: AuditFacets;
  onChange: (value: AuditFilters) => void;
}

export function FiltrosAuditoria({ value, facets, onChange }: FiltrosAuditoriaProps) {
  const hasFilters = Object.values(value).some((filter) => filter !== '');

  return (
    <div className="mb-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
      <FormField label="Tipo">
        <select
          value={value.entity_type}
          onChange={(event) => onChange({ ...value, entity_type: event.target.value })}
          className={inputClass}
        >
          <option value="">Todos</option>
          {facets.entity_types.map((type) => (
            <option key={type} value={type}>
              {entityLabel(type)}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Acción">
        <select
          value={value.action}
          onChange={(event) => onChange({ ...value, action: event.target.value })}
          className={inputClass}
        >
          <option value="">Todas</option>
          {facets.actions.map((action) => (
            <option key={action} value={action}>
              {actionLabel(action)}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Desde">
        <input
          type="date"
          min={MIN_DATE}
          max={MAX_DATE}
          value={value.from}
          onChange={(event) => onChange({ ...value, from: event.target.value })}
          className={inputClass}
        />
      </FormField>
      <FormField label="Hasta">
        <input
          type="date"
          min={MIN_DATE}
          max={MAX_DATE}
          value={value.to}
          onChange={(event) => onChange({ ...value, to: event.target.value })}
          className={inputClass}
        />
      </FormField>
      <Boton variant="secundario" disabled={!hasFilters} onClick={() => onChange(EMPTY_AUDIT_FILTERS)}>
        Quitar filtros
      </Boton>
    </div>
  );
}
