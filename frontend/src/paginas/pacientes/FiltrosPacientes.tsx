// =============================================================================
// FiltrosPacientes.tsx
// Qué hace:     la barra de búsqueda de la lista de pacientes: un cuadro para
//               buscar y una casilla para incluir a los desactivados.
// Depende de:   componentes/ui/FormField.tsx y servicios/pacientes.ts (tipos).
// Lo usa:       paginas/pacientes/PaginaPacientes.tsx.
//
// Es un componente "tonto": no consulta nada; solo muestra los valores que le
// pasa la página y avisa cuando la persona cambia alguno.
// =============================================================================
import { Search } from 'lucide-react';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import type { PatientFilters } from '../../servicios/pacientes';

interface FiltrosPacientesProps {
  value: PatientFilters;
  onChange: (value: PatientFilters) => void;
}

export function FiltrosPacientes({ value, onChange }: FiltrosPacientesProps) {
  return (
    <div className="mb-4 grid items-end gap-3 sm:grid-cols-[minmax(0,2fr)_auto]">
      <FormField label="Buscar paciente">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-suave"
            aria-hidden="true"
          />
          <input
            type="search"
            value={value.search}
            onChange={(event) => onChange({ ...value, search: event.target.value })}
            placeholder="Nombre, teléfono, DUI o expediente"
            className={`${inputClass} pl-9`}
          />
        </div>
      </FormField>
      <label className="flex items-center gap-2 pb-2 text-sm text-texto">
        <input
          type="checkbox"
          checked={value.includeInactive}
          onChange={(event) => onChange({ ...value, includeInactive: event.target.checked })}
          className="size-4 accent-marca"
        />
        Incluir desactivados
      </label>
    </div>
  );
}
