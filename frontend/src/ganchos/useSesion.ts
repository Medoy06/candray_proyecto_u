// =============================================================================
// useSesion.ts
// Qué hace:     gancho (hook) para leer la sesión desde cualquier componente:
//               const { user, activeBranch, can, logout } = useSesion();
// Depende de:   contexto/SesionContext.ts.
// =============================================================================
import { useContext } from 'react';
import { SessionContext, type SessionContextValue } from '../contexto/SesionContext';

export function useSesion(): SessionContextValue {
  const context = useContext(SessionContext);
  if (context === null) {
    // Error de programación: se usó fuera de <SesionProvider> (ver main.tsx).
    throw new Error('useSesion debe usarse dentro de <SesionProvider>.');
  }
  return context;
}
