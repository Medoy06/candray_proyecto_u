// =============================================================================
// SelectorSucursal.tsx
// Qué hace:     muestra en qué sucursal está trabajando la persona. Si tiene
//               acceso a más de una, permite cambiarla desde una lista.
// Depende de:   ganchos/useSesion.ts (sucursales, sucursal activa, selectBranch).
// Lo usa:       componentes/estructura/EncabezadoApp.tsx.
//
// Junto al nombre va un punto con el color de la sucursal. El nombre se escribe
// siempre en el color de texto normal (no en el de la sucursal): el color de una
// sucursal lo elige el administrador y un texto de ese color podría no leerse.
// =============================================================================
import { ChevronDown } from 'lucide-react';
import { useSesion } from '../../ganchos/useSesion';

export function SelectorSucursal() {
  const { branches, activeBranch, selectBranch } = useSesion();
  if (activeBranch === null) return null;

  // Una sola sucursal: no hay nada que elegir, solo se muestra cuál es.
  if (branches.length <= 1) {
    return (
      <p className="inline-flex items-center gap-2 text-sm font-medium text-titulo">
        <span className="size-2.5 rounded-full bg-acento" aria-hidden="true" />
        {activeBranch.name}
      </p>
    );
  }

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Sucursal activa</span>
      <span className="pointer-events-none absolute left-3 size-2.5 rounded-full bg-acento" aria-hidden="true" />
      <select
        value={activeBranch.id}
        onChange={(event) => selectBranch(event.target.value)}
        className="appearance-none rounded-md border border-borde-fuerte bg-superficie py-1.5 pl-8 pr-8 text-sm font-medium text-titulo hover:bg-apoyo"
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-4 text-texto-suave" aria-hidden="true" />
    </label>
  );
}
