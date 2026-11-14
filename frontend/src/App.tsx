// =============================================================================
// App.tsx
// Qué hace:     decide qué pantalla mostrar según el estado de la sesión:
//               comprobando -> "Cargando"; sin sesión -> inicio de sesión;
//               con sesión -> la aplicación.
// Depende de:   ganchos/useSesion.ts y paginas/autenticacion.
//
// (Paso 5a) La aplicación con sesión es aún una pantalla provisional; el paso 5b
// la reemplaza por la estructura general con barra lateral y menú por rol.
// =============================================================================
import { useSesion } from './ganchos/useSesion';
import { PaginaInicioSesion } from './paginas/autenticacion/PaginaInicioSesion';
import { ROLE_LABELS } from './configuracion/roles';

export default function App() {
  const { status, user, activeBranch, logout } = useSesion();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-500">Cargando...</p>
      </div>
    );
  }

  if (status === 'anonymous' || user === null) return <PaginaInicioSesion />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100">
      <h1 className="text-2xl font-bold text-acento">Bienvenido, {user.full_name}</h1>
      <p className="text-slate-600">
        {ROLE_LABELS[user.role]} · {activeBranch?.name}
      </p>
      <button
        type="button"
        onClick={logout}
        className="rounded-lg bg-acento px-4 py-2 text-sm text-white hover:bg-acento-oscuro"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
