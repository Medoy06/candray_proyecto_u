// =============================================================================
// almacenSesion.ts
// Qué hace:     guarda en el navegador (localStorage) el token de la sesión y la
//               sucursal elegida, para que sobrevivan a recargar la página.
// Lo usan:      servicios/clienteApi.ts y contexto/SesionProvider.tsx.
//
// Nota de seguridad: localStorage lo puede leer cualquier script de la página.
// Para esta demostración es aceptable (el token dura 8 horas y se revisa en el
// servidor en cada petición); un sistema real usaría cookies httpOnly.
//
// Todas las lecturas y escrituras están dentro de try/catch: en modo privado o
// con el almacenamiento bloqueado el navegador lanza errores, y la aplicación
// debe seguir funcionando (solo que sin recordar la sesión).
// =============================================================================
const TOKEN_KEY = 'candray_token';
const BRANCH_KEY = 'candray_sucursal';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento: la sesión vale solo hasta recargar la página.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nada que borrar si el almacenamiento no está disponible.
  }
}

export const getStoredToken = (): string | null => read(TOKEN_KEY);
export const storeToken = (token: string): void => write(TOKEN_KEY, token);

export const getStoredBranchId = (): string | null => read(BRANCH_KEY);
export const storeBranchId = (branchId: string): void => write(BRANCH_KEY, branchId);
export const clearStoredBranchId = (): void => remove(BRANCH_KEY);

// Olvida todo (al cerrar sesión).
export function clearSession(): void {
  remove(TOKEN_KEY);
  remove(BRANCH_KEY);
}
