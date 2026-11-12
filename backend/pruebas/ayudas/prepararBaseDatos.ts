// =============================================================================
// prepararBaseDatos.ts
// Qué hace:     deja la base de datos de PRUEBA lista antes de correr las
//               pruebas: la vacía por completo y le aplica todas las
//               migraciones. Así cada ejecución parte de cero y no depende de
//               lo que dejó la anterior.
// Depende de:   scripts/aplicarMigraciones.ts y configuracion/baseDatos.ts.
// Lo usa:       vitest (globalSetup en vitest.config.mts), una vez por ejecución.
//
// SEGURIDAD: borrar el esquema es destructivo. Por eso este archivo se niega a
// continuar si la base conectada no se llama exactamente "candray_test". Así,
// aunque alguien configure mal el entorno, jamás se borra la base de la demo.
// =============================================================================
export const TEST_DATABASE_NAME = 'candray_test';

export default async function prepareTestDatabase(): Promise<void> {
  // Se fija el nombre ANTES de importar el pool, porque el pool lee el entorno
  // en el momento en que se importa.
  process.env.DB_NAME = TEST_DATABASE_NAME;
  process.env.NODE_ENV = 'test';

  const { pool, closeDatabase } = await import('../../src/configuracion/baseDatos');
  const { applyMigrations } = await import('../../../scripts/aplicarMigraciones');

  try {
    let currentDatabase: string;
    try {
      const result = await pool.query<{ db: string }>('SELECT current_database() AS db');
      currentDatabase = result.rows[0].db;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `No se pudo conectar a la base de pruebas "${TEST_DATABASE_NAME}": ${reason}\n` +
          'Si no existe, créela una vez con:\n' +
          `  sudo -u postgres createdb --owner=candray_user ${TEST_DATABASE_NAME}`,
      );
    }

    if (currentDatabase !== TEST_DATABASE_NAME) {
      throw new Error(
        `Por seguridad no se borra la base "${currentDatabase}": solo se permite "${TEST_DATABASE_NAME}".`,
      );
    }

    // Vacía todo (tablas, tipos, funciones, extensiones del esquema public) y
    // lo vuelve a crear. La migración 01 vuelve a habilitar btree_gist.
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await applyMigrations({ log: () => undefined });
  } finally {
    await closeDatabase();
  }
}
