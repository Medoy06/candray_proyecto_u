// =============================================================================
// errorApi.ts
// Qué hace:     getApiErrorMessage(): convierte cualquier error de una llamada a
//               la API en un mensaje en español listo para mostrar al usuario.
// Depende de:   axios (solo para reconocer sus errores).
// Lo usan:      las páginas y ganchos que llaman a la API.
//
// El backend responde los errores con la forma { success: false, message }.
// Los mensajes del backend ya están en español y pensados para el usuario
// (incluidos los del bloqueo de cuenta), así que se muestran tal cual.
// =============================================================================
import axios from 'axios';

const NO_CONNECTION = 'No se pudo conectar con el servidor. Verifique que esté en funcionamiento.';
const GENERIC = 'Ocurrió un error inesperado. Intente de nuevo.';

// Devuelve el mensaje que se debe mostrar para un error.
// Recibe: el error capturado y, opcionalmente, un mensaje propio para cuando la
// API no explique nada.
export function getApiErrorMessage(error: unknown, fallback: string = GENERIC): string {
  if (axios.isAxiosError(error)) {
    // Sin respuesta: el servidor está apagado o no hay red.
    if (!error.response) return NO_CONNECTION;
    const message: unknown = error.response.data?.message;
    if (typeof message === 'string' && message !== '') return message;
  }
  return fallback;
}
