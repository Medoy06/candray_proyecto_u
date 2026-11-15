// =============================================================================
// SelectorSucursales.tsx
// Qué hace:     la lista de sucursales con casillas para marcar las que tendrá
//               un usuario, y un botón de opción para elegir la predeterminada
//               (la sucursal en la que entra al iniciar sesión).
// Depende de:   paginas/usuarios/seleccionSucursales.ts.
// Lo usan:      los formularios de usuarios.
//
// Solo se ofrecen sucursales ACTIVAS: no tiene sentido asignar una cerrada.
// =============================================================================
import type { ManagedBranch } from '../../servicios/sucursales';
import { setDefaultBranch, toggleBranch, type BranchSelection } from './seleccionSucursales';

interface SelectorSucursalesProps {
  branches: ManagedBranch[]; // ya filtradas: solo las activas
  value: BranchSelection;
  onChange: (value: BranchSelection) => void;
}

export function SelectorSucursales({ branches, value, onChange }: SelectorSucursalesProps) {
  if (branches.length === 0) {
    return <p className="text-sm text-texto-suave">No hay sucursales activas para asignar.</p>;
  }

  return (
    <fieldset className="sm:col-span-2">
      <legend className="mb-1 text-sm font-medium text-texto">Sucursales asignadas</legend>
      <ul className="divide-y divide-borde rounded-md border border-borde">
        {branches.map((branch) => {
          const checked = value.ids.includes(branch.id);
          return (
            <li key={branch.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <label className="flex items-center gap-2 text-sm text-texto">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange(toggleBranch(value, branch.id))}
                  className="size-4 accent-marca"
                />
                {branch.name}
              </label>
              {checked && (
                <label className="flex items-center gap-2 text-xs text-texto-suave">
                  <input
                    type="radio"
                    name="sucursal-predeterminada"
                    checked={value.defaultId === branch.id}
                    onChange={() => onChange(setDefaultBranch(value, branch.id))}
                    aria-label={`Sucursal predeterminada: ${branch.name}`}
                    className="size-4 accent-marca"
                  />
                  Predeterminada
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
