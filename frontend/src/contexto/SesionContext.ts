// =============================================================================
// SesionContext.ts
// Qué hace:     define el "contexto" de la sesión: qué datos y acciones quedan
//               disponibles para toda la aplicación (usuario, sucursal activa,
//               iniciar/cerrar sesión, cambiar de sucursal, saber si puede algo).
// Lo usan:      contexto/SesionProvider.tsx (lo llena) y ganchos/useSesion.ts (lo lee).
// =============================================================================
import { createContext } from 'react';
import type { Capability } from '../configuracion/capacidades';
import type { Branch, SessionUser } from '../servicios/tiposSesion';

// 'loading': todavía se comprueba la sesión guardada; 'anonymous': no hay sesión;
// 'authenticated': hay sesión válida.
export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

export interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  branches: Branch[];         // las sucursales a las que puede entrar
  activeBranch: Branch | null; // en la que está trabajando ahora
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  selectBranch: (branchId: string) => void;
  // ¿Puede hacer esto? Solo sirve para mostrar u ocultar opciones; el backend
  // es quien realmente autoriza cada acción.
  can: (capability: Capability) => boolean;
}

export const SessionContext = createContext<SessionContextValue | null>(null);
