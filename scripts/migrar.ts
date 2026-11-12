// =============================================================================
// migrar.ts
// Qué hace:     comando para aplicar las migraciones pendientes a la base de
//               datos configurada en backend/.env.
// Uso:          desde la carpeta backend/:   npm run migrar
// Depende de:   aplicarMigraciones.ts (la lógica) y baseDatos.ts (el pool).
//
// Este archivo solo es la "puerta de entrada": avisa, llama a la lógica,
// muestra el error si lo hay (y termina con código 1) y cierra las conexiones.
// =============================================================================
import { closeDatabase } from '../backend/src/configuracion/baseDatos';
import { applyMigrations } from './aplicarMigraciones';

console.log('Aplicando migraciones...');
applyMigrations()
  .catch((error: unknown) => {
    console.error(`\nERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
