// =============================================================================
// EncabezadoApp.tsx
// Qué hace:     la barra superior: la marca de Candray, el selector de sucursal,
//               quién tiene la sesión abierta y el botón para cerrarla. Debajo
//               lleva una franja fina con el color de la sucursal activa.
// Depende de:   ganchos/useSesion.ts, configuracion/roles.ts y los componentes
//               MarcaCandray y SelectorSucursal.
// Lo usa:       componentes/estructura/Estructura.tsx.
// =============================================================================
import { LogOut } from 'lucide-react';
import { ROLE_LABELS } from '../../configuracion/roles';
import { useSesion } from '../../ganchos/useSesion';
import { MarcaCandray } from '../ui/MarcaCandray';
import { SelectorSucursal } from './SelectorSucursal';

export function EncabezadoApp() {
  const { user, logout } = useSesion();
  if (user === null) return null;

  return (
    <header className="bg-superficie">
      <div className="flex h-14 items-center justify-between gap-4 border-b border-borde px-4">
        <MarcaCandray />
        <div className="flex items-center gap-4">
          <SelectorSucursal />
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-medium text-texto">{user.full_name}</p>
            <p className="text-xs text-texto-suave">{ROLE_LABELS[user.role]}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Cerrar sesión"
            className="inline-flex items-center gap-2 rounded-md border border-borde-fuerte px-3 py-1.5 text-sm text-titulo transition-colors hover:bg-apoyo"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden md:inline">Cerrar sesión</span>
          </button>
        </div>
      </div>
      {/* Franja con el color de la sucursal activa (variable --acento). */}
      <div className="h-[3px] bg-acento" data-testid="franja-sucursal" aria-hidden="true" />
    </header>
  );
}
