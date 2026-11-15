// =============================================================================
// BarraLateral.tsx
// Qué hace:     el menú lateral. Muestra solo las pantallas que la persona puede
//               abrir (según las capacidades que publica el backend), agrupadas
//               por sección, y marca la pantalla actual con una barra roja.
//               Se puede colapsar a solo iconos.
// Depende de:   configuracion/rutas.ts (visibleSections), ganchos/useSesion.ts y
//               ganchos/useBarraColapsable.ts.
// Lo usa:       componentes/estructura/Estructura.tsx.
//
// Detalles de accesibilidad:
//   - Al colapsar, el nombre de cada opción sigue en el HTML (oculto a la vista,
//     visible para el lector de pantalla), así que nunca queda un botón sin nombre.
//   - NavLink marca la opción actual con aria-current="page". Para la dirección "/"
//     (Inicio) React Router solo la marca en el inicio mismo, no en todas las pantallas.
// =============================================================================
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { visibleSections } from '../../configuracion/rutas';
import { useBarraColapsable } from '../../ganchos/useBarraColapsable';
import { useSesion } from '../../ganchos/useSesion';

export function BarraLateral() {
  const { can } = useSesion();
  const { collapsed, toggle } = useBarraColapsable();
  const sections = visibleSections(can);

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-borde bg-superficie transition-[width] duration-200 ${
        collapsed ? 'w-14' : 'w-60'
      }`}
    >
      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto py-2">
        {sections.map((section, index) => (
          <div key={section.key}>
            {collapsed ? (
              // Colapsado no hay encabezados: una línea separa las secciones (menos antes de la primera).
              index > 0 && (
                <div className="mx-3 my-2 border-t border-borde" aria-hidden="true" />
              )
            ) : (
              <p className="px-4 pb-1 pt-4 text-xs font-medium uppercase tracking-wider text-texto-suave">
                {section.label}
              </p>
            )}
            {section.routes.map((route) => (
              <NavLink
                key={route.id}
                to={route.path}
                title={collapsed ? route.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 border-l-[3px] px-4 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'border-marca bg-apoyo font-medium text-titulo'
                      : 'border-transparent text-texto hover:bg-apoyo'
                  }`
                }
              >
                <route.icon className="size-5 shrink-0" aria-hidden="true" />
                <span className={collapsed ? 'sr-only' : ''}>{route.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-borde p-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
          aria-expanded={!collapsed}
          className="flex w-full items-center justify-center rounded-md p-2 text-texto-suave transition-colors hover:bg-apoyo hover:text-titulo"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-5" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>
    </aside>
  );
}
