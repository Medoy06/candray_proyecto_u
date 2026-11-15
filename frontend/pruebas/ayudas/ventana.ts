// =============================================================================
// ventana.ts
// Qué hace:     simula el ancho de la ventana (matchMedia), que jsdom no trae.
//               Permite probar el menú que se colapsa en ventanas angostas y
//               "redimensionar" la ventana durante la prueba.
// Lo usan:      preparar.ts (la deja ancha antes de cada prueba) y las pruebas
//               del menú lateral.
// =============================================================================
import { act } from '@testing-library/react';

type Listener = (event: MediaQueryListEvent) => void;

let narrow = false;
const listeners = new Set<Listener>();

// Instala la ventana falsa. Recibe: si arranca angosta (menos de 1024px).
export function installFakeWindow(startNarrow = false): void {
  narrow = startNarrow;
  listeners.clear();
  window.matchMedia = ((query: string) =>
    ({
      matches: narrow,
      media: query,
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

// "Redimensiona" la ventana: avisa a quien esté escuchando, igual que el navegador.
export function resizeWindow(toNarrow: boolean): void {
  narrow = toNarrow;
  act(() => {
    listeners.forEach((listener) => listener({ matches: toNarrow } as MediaQueryListEvent));
  });
}

// Cuántos componentes siguen escuchando el cambio de tamaño (para comprobar que
// se desuscriben al desmontarse y no dejan escuchas colgadas).
export function activeResizeListeners(): number {
  return listeners.size;
}
