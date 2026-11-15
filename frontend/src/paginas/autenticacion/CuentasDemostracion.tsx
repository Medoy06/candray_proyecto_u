// =============================================================================
// CuentasDemostracion.tsx
// Qué hace:     botones de atajo para llenar el login con una cuenta de
//               demostración (útil al presentar el sistema).
// Depende de:   configuracion/demostracion.ts y configuracion/roles.ts.
// Lo usa:       PaginaInicioSesion.tsx.
//
// Solo se muestra en desarrollo (import.meta.env.DEV): al compilar para
// producción desaparece, para no publicar cuentas ni contraseñas.
// =============================================================================
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../configuracion/demostracion';

interface CuentasDemostracionProps {
  onPick: (email: string, password: string) => void;
}

export function CuentasDemostracion({ onPick }: CuentasDemostracionProps) {
  if (!import.meta.env.DEV) return null;

  return (
    <div className="mt-6 border-t border-borde pt-4">
      <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-texto-suave">
        Cuentas de demostración
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.email}
            type="button"
            onClick={() => onPick(account.email, DEMO_PASSWORD)}
            className="rounded-md border border-borde-fuerte px-3 py-1 text-xs text-texto-suave transition-colors hover:border-marca hover:text-marca"
          >
            {account.label}
          </button>
        ))}
      </div>
    </div>
  );
}
