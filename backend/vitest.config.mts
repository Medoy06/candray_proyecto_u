// =============================================================================
// vitest.config.mts
// Configuración del ejecutor de pruebas (vitest).
// Las pruebas viven en backend/pruebas/ y se llaman  nombre.prueba.ts.
// Se ejecutan con:  npm test
//
// Las pruebas que usan base de datos trabajan SIEMPRE sobre la base
// "candray_test", nunca sobre "candray_mockup" (la de la demostración):
//   - `env` fuerza ese nombre de base en los procesos de prueba.
//   - prepararBaseDatos.ts la recrea desde cero antes de cada ejecución.
// BCRYPT_ROUNDS=4 hace que crear usuarios sea rápido en las pruebas (en uso
// normal se usan 10).
// =============================================================================
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['pruebas/**/*.prueba.ts'],
    environment: 'node',
    globalSetup: ['./pruebas/ayudas/prepararBaseDatos.ts'],
    env: {
      NODE_ENV: 'test',
      DB_NAME: 'candray_test',
      BCRYPT_ROUNDS: '4',
      PERFIL_PERMISOS: 'demostracion',
    },
  },
});
