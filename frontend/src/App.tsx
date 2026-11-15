// =============================================================================
// App.tsx
// Qué hace:     decide qué pantalla mostrar según el estado de la sesión:
//               comprobando -> "Cargando"; sin sesión -> inicio de sesión;
//               con sesión -> la aplicación (menú, encabezado y páginas).
// Depende de:   ganchos/useSesion.ts, paginas/autenticacion y navegacion.
// Lo usa:       main.tsx.
// =============================================================================
import { useSesion } from './ganchos/useSesion';
import { RutasAplicacion } from './navegacion/RutasAplicacion';
import { PaginaInicioSesion } from './paginas/autenticacion/PaginaInicioSesion';

export default function App() {
  const { status, user } = useSesion();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fondo">
        <p role="status" className="text-texto-suave">
          Cargando...
        </p>
      </div>
    );
  }

  if (status === 'anonymous' || user === null) return <PaginaInicioSesion />;

  return <RutasAplicacion />;
}
