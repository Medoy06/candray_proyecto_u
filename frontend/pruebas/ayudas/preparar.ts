// =============================================================================
// preparar.ts
// Qué hace:     preparación común de las pruebas del frontend: agrega las
//               comprobaciones extra para el DOM (toBeInTheDocument...) y deja
//               todo limpio entre una prueba y la siguiente.
// =============================================================================
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { onUnauthorized } from '../../src/servicios/clienteApi';

afterEach(() => {
  cleanup(); // desmonta lo que dibujó la prueba
  localStorage.clear(); // sin token ni sucursal guardados
  document.documentElement.removeAttribute('style'); // sin color de acento aplicado
  onUnauthorized(null);
});
