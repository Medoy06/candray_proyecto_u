// =============================================================================
// autenticacion.ts (servicio)
// Qué hace:     las dos llamadas de sesión a la API: iniciar sesión y consultar
//               la sesión actual.
// Depende de:   servicios/clienteApi.ts y servicios/tiposSesion.ts.
// Lo usa:       contexto/SesionProvider.tsx.
// =============================================================================
import { api } from './clienteApi';
import type { LoginData, SessionData } from './tiposSesion';

// POST /api/auth/login
// Lanza error (axios) si las credenciales son incorrectas (401), la cuenta está
// bloqueada (423) o no tiene sucursales (403).
export async function loginRequest(email: string, password: string): Promise<LoginData> {
  const response = await api.post<{ data: LoginData }>('/auth/login', { email, password });
  return response.data.data;
}

// GET /api/auth/me — la sesión actual (con la sucursal de la cabecera X-Sucursal-Id).
export async function getSession(): Promise<SessionData> {
  const response = await api.get<{ data: SessionData }>('/auth/me');
  return response.data.data;
}
