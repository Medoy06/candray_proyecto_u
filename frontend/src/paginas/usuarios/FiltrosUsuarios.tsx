// =============================================================================
// FiltrosUsuarios.tsx
// Qué hace:     la barra de filtros de la lista de usuarios: buscar por nombre o
//               correo, filtrar por rol y por estado.
// Depende de:   configuracion/roles.ts y componentes/ui/FormField.tsx.
// Lo usa:       paginas/usuarios/PaginaUsuarios.tsx.
//
// Es un componente "tonto": no consulta nada; solo muestra los valores que le
// pasa la página y avisa cuando la persona cambia alguno.
// =============================================================================
import { Search } from 'lucide-react';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { ROLES, ROLE_LABELS } from '../../configuracion/roles';

export interface UserFilterValues {
  search: string;
  role: string;   // '' = todos, o un rol
  status: string; // '' = todos, 'activos' o 'inactivos'
}

interface FiltrosUsuariosProps {
  value: UserFilterValues;
  onChange: (value: UserFilterValues) => void;
}

export function FiltrosUsuarios({ value, onChange }: FiltrosUsuariosProps) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <FormField label="Buscar">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-suave"
            aria-hidden="true"
          />
          <input
            type="search"
            value={value.search}
            onChange={(event) => onChange({ ...value, search: event.target.value })}
            placeholder="Nombre o correo"
            className={`${inputClass} pl-9`}
          />
        </div>
      </FormField>
      <FormField label="Rol">
        <select
          value={value.role}
          onChange={(event) => onChange({ ...value, role: event.target.value })}
          className={inputClass}
        >
          <option value="">Todos</option>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Estado">
        <select
          value={value.status}
          onChange={(event) => onChange({ ...value, status: event.target.value })}
          className={inputClass}
        >
          <option value="">Todos</option>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
        </select>
      </FormField>
    </div>
  );
}
