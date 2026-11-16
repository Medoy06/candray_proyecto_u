// =============================================================================
// Estructura.tsx
// Qué hace:     el marco de toda pantalla con sesión: encabezado arriba, menú
//               lateral a la izquierda y, a la derecha, la página actual (Outlet).
// Depende de:   EncabezadoApp y BarraLateral.
// Lo usa:       navegacion/RutasAplicacion.tsx.
//
// El contenido (main) es el único que se desplaza; el encabezado y el menú
// quedan fijos. Incluye un enlace "Saltar al contenido" que solo aparece al
// navegar con teclado, para no recorrer todo el menú en cada página.
// =============================================================================
import { Outlet } from 'react-router-dom';
import { BarraLateral } from './BarraLateral';
import { EncabezadoApp } from './EncabezadoApp';

export function Estructura() {
  return (
    <div className="flex h-screen flex-col bg-fondo print:block print:h-auto">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded-md focus:bg-superficie focus:px-3 focus:py-2 focus:text-sm focus:text-titulo"
      >
        Saltar al contenido
      </a>
      {/* Al imprimir solo sale el contenido: sin encabezado ni menú. */}
      <div className="print:hidden">
        <EncabezadoApp />
      </div>
      <div className="flex min-h-0 flex-1 print:block">
        <div className="flex print:hidden">
          <BarraLateral />
        </div>
        <main id="contenido" tabIndex={-1} className="min-w-0 flex-1 overflow-auto p-6 focus:outline-none print:overflow-visible print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
