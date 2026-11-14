// =============================================================================
// clienteApi.ts
// Qué hace:     el cliente HTTP (axios) que usan TODOS los servicios. En cada
//               petición agrega el token y la sucursal activa; si el servidor
//               responde 401 (sesión vencida o usuario desactivado) avisa para
//               cerrar la sesión.
// Depende de:   servicios/almacenSesion.ts.
// Lo usan:      todos los archivos de servicios/.
//
// Cabeceras que envía:
//   Authorization: Bearer <token>   quién es
//   X-Sucursal-Id: <id>             en qué sucursal está trabajando
// =============================================================================
import axios from 'axios';
import { getStoredBranchId, getStoredToken } from './almacenSesion';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  const branchId = getStoredBranchId();
  if (branchId) config.headers.set('X-Sucursal-Id', branchId);
  return config;
});

// Función que se ejecuta cuando el servidor responde 401. La registra el
// proveedor de sesión (así este archivo no necesita conocer React).
let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    // Un 401 en el inicio de sesión es "credenciales incorrectas", no una
    // sesión vencida: ese lo muestra la pantalla de login, no cierra nada.
    const isLoginRequest = axios.isAxiosError(error) && error.config?.url === '/auth/login';
    if (axios.isAxiosError(error) && error.response?.status === 401 && !isLoginRequest) {
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  },
);
