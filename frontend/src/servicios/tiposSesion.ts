// =============================================================================
// tiposSesion.ts
// Qué hace:     los tipos de los datos de la sesión tal como los entrega la API
//               (POST /api/auth/login y GET /api/auth/me).
// Lo usan:      servicios/autenticacion.ts y el proveedor de sesión.
// =============================================================================
import type { Capability } from '../configuracion/capacidades';
import type { Role } from '../configuracion/roles';

export interface SessionUser {
  id: string;
  full_name: string;
  email: string;
  role: Role;
}

// Sucursal a la que el usuario puede entrar.
export interface Branch {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  opening_time: string;
  closing_time: string;
  theme_color: string;
  has_optical_counter: boolean;
}

// Lo que entrega la API sobre la sesión.
export interface SessionData {
  user: SessionUser;
  capabilities: Capability[];
  branches: Branch[]; // la predeterminada primero
  activeBranchId: string;
}

// El inicio de sesión además entrega el token.
export interface LoginData extends SessionData {
  token: string;
}
