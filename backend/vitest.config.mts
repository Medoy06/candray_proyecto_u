// =============================================================================
// vitest.config.ts
// Configuración del ejecutor de pruebas (vitest).
// Las pruebas viven en backend/pruebas/ y se llaman  nombre.prueba.ts.
// Se ejecutan con:  npm test
// =============================================================================
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['pruebas/**/*.prueba.ts'],
    environment: 'node',
  },
});
