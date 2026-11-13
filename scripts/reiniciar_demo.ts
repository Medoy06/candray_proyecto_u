// =============================================================================
// reiniciar_demo.ts
// Qué hace:     deja la base de datos de DEMOSTRACIÓN siempre en el mismo
//               estado: la borra por completo, aplica todas las migraciones y
//               siembra los datos ficticios.
// Uso:          desde la carpeta backend/:   npm run reiniciar_demo
// Depende de:   aplicarMigraciones.ts y base_datos/semillas/demostracion.ts.
//
// SEGURIDAD: es destructivo. Por eso se niega a continuar si
//   - el entorno es producción, o
//   - la base conectada no se llama exactamente "candray_mockup".
// =============================================================================
import { DEMO_BRANCHES, DEMO_PASSWORD, DEMO_USERS, seedDemo } from '../base_datos/semillas/demostracion';
import { closeDatabase, pool } from '../backend/src/configuracion/baseDatos';
import { env } from '../backend/src/configuracion/entorno';
import { applyMigrations } from './aplicarMigraciones';

const DEMO_DATABASE_NAME = 'candray_mockup';

async function resetDemo(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('No se reinicia la demostración con NODE_ENV=production.');
  }

  const current = await pool.query<{ db: string }>('SELECT current_database() AS db');
  if (current.rows[0].db !== DEMO_DATABASE_NAME) {
    throw new Error(
      `Por seguridad solo se reinicia la base "${DEMO_DATABASE_NAME}", y está conectado a "${current.rows[0].db}".`,
    );
  }

  console.log(`Reiniciando la base "${DEMO_DATABASE_NAME}": se borra TODO su contenido.\n`);
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');

  console.log('Migraciones:');
  await applyMigrations();

  const summary = await seedDemo();
  console.log(`\nSemilla: ${summary.branches} sucursales y ${summary.users} usuarios.\n`);

  console.log(`Usuarios de demostración (contraseña de todos: ${DEMO_PASSWORD})`);
  for (const user of DEMO_USERS) {
    const branches = user.branchCodes.length > 0 ? user.branchCodes.join(', ') : 'todas las activas';
    console.log(`  ${user.role.padEnd(16)} ${user.email.padEnd(34)} sucursales: ${branches}`);
  }
  const inactive = DEMO_BRANCHES.filter((branch) => !branch.is_active).map((branch) => branch.code);
  console.log(`\nSucursales inactivas (no aparecen en el selector): ${inactive.join(', ')}`);
}

resetDemo()
  .catch((error: unknown) => {
    console.error(`\nERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
