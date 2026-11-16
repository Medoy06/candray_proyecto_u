// =============================================================================
// preparar_demo.ts
// Qué hace:     deja la base de datos lista para usarse: aplica las migraciones
//               pendientes y, SOLO si la base está vacía (sin usuarios), carga
//               los datos de demostración.
// Uso:          desde backend/:   npm run preparar_demo
//               (el contenedor lo ejecuta solo cada vez que se inicia).
// Depende de:   aplicarMigraciones.ts, la semilla de demostración y baseDatos.ts.
//
// Se puede ejecutar muchas veces sin riesgo: si ya hay usuarios no siembra nada
// ni borra nada. A diferencia de reiniciar_demo.ts, nunca vacía la base, y por
// eso sí puede correr con NODE_ENV=production.
// =============================================================================
import { closeDatabase, pool } from '../backend/src/configuracion/baseDatos';
import { seedDemo } from '../base_datos/semillas/demostracion';
import { applyMigrations } from './aplicarMigraciones';

async function prepareDemo(): Promise<void> {
  console.log('Aplicando migraciones...');
  await applyMigrations();

  const users = await pool.query<{ total: number }>('SELECT count(*)::int AS total FROM users');
  if (users.rows[0].total > 0) {
    console.log('\nLa base ya tiene datos: no se siembra nada.');
    return;
  }

  console.log('\nLa base está vacía: se cargan los datos de demostración...');
  const summary = await seedDemo();
  console.log(`Listo: ${summary.branches} sucursales y ${summary.users} usuarios de demostración.`);
}

prepareDemo()
  .catch((error: unknown) => {
    console.error(`\nERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
