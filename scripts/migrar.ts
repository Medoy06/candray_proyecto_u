// =============================================================================
// migrar.ts
// Aplica, en orden, los archivos SQL de base_datos/migraciones/ que todavía no
// se han aplicado a la base de datos, y lleva el registro de cuáles ya se
// aplicaron en la tabla schema_migrations.
//
// Uso (desde la carpeta backend/):
//   npm run migrar
//
// Reglas que hace cumplir:
//   1. Los archivos se llaman NN_nombre.sql y se numeran 01, 02, 03... sin
//      saltos ni repetidos.
//   2. Cada migración se aplica dentro de una transacción: o se aplica completa
//      o no se aplica nada.
//   3. Una migración ya aplicada NO se puede modificar. Si el archivo cambió,
//      el script se detiene (compara una huella SHA-256 guardada al aplicarla).
//      Para cambiar algo, se escribe una migración nueva.
//   4. Nunca corren dos ejecuciones a la vez (candado de PostgreSQL).
//
// Reutiliza el pool de backend/src/configuracion/baseDatos.ts, así que lee la
// misma configuración (backend/.env) que el servidor.
// =============================================================================
import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { closeDatabase, pool } from '../backend/src/configuracion/baseDatos';

const MIGRATIONS_DIR = resolve(__dirname, '../base_datos/migraciones');

// Nombre válido: dos dígitos, guion bajo, nombre en minúsculas, ".sql".
const FILE_NAME_PATTERN = /^(\d{2})_[a-z0-9_]+\.sql$/;

// Número cualquiera para el candado de PostgreSQL (pg_advisory_lock). Dos
// procesos que usen el mismo número no pueden tener el candado al mismo tiempo.
const LOCK_KEY = 727001;

interface MigrationFile {
  version: string; // nombre del archivo, ej.: "01_base.sql"
  sql: string;
  checksum: string; // huella SHA-256 del contenido
}

// Lee los archivos de la carpeta y comprueba que la numeración sea 01, 02, 03...
function readMigrationFiles(): MigrationFile[] {
  const names = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const files: MigrationFile[] = names.map((name, index) => {
    const match = FILE_NAME_PATTERN.exec(name);
    if (!match) {
      throw new Error(
        `El archivo "${name}" no cumple el formato NN_nombre.sql (minúsculas, sin espacios).`,
      );
    }
    const expectedNumber = String(index + 1).padStart(2, '0');
    if (match[1] !== expectedNumber) {
      throw new Error(
        `Numeración rota: se esperaba la migración ${expectedNumber}_*.sql pero se encontró "${name}".`,
      );
    }
    // Se normaliza el salto de línea para que la huella sea la misma en
    // Windows (CRLF) y en Linux (LF).
    const sql = readFileSync(join(MIGRATIONS_DIR, name), 'utf8').replace(/\r\n/g, '\n');
    const checksum = createHash('sha256').update(sql).digest('hex');
    return { version: name, sql, checksum };
  });

  return files;
}

async function migrate(): Promise<void> {
  const files = readMigrationFiles();
  if (files.length === 0) {
    console.log('No hay archivos en base_datos/migraciones/. Nada que aplicar.');
    return;
  }

  // Se usa UNA sola conexión para todo el proceso porque el candado de
  // PostgreSQL pertenece a la conexión que lo pidió.
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);

    // Tabla de registro. Se crea aquí (y no en una migración) porque debe
    // existir antes de poder aplicar la primera.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    varchar(100) PRIMARY KEY,
        checksum   char(64)     NOT NULL,
        applied_at timestamp    NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador')
      )
    `);

    const appliedResult = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations ORDER BY version',
    );
    const applied = new Map(appliedResult.rows.map((row) => [row.version, row.checksum]));

    // Una migración registrada cuyo archivo ya no existe es una señal de alarma.
    for (const version of applied.keys()) {
      if (!files.some((file) => file.version === version)) {
        throw new Error(
          `La migración "${version}" está registrada en la base pero su archivo no existe.`,
        );
      }
    }

    let newCount = 0;
    for (const file of files) {
      const previousChecksum = applied.get(file.version);

      if (previousChecksum !== undefined) {
        if (previousChecksum.trim() !== file.checksum) {
          throw new Error(
            `La migración "${file.version}" ya fue aplicada y su contenido cambió. ` +
              'Las migraciones aplicadas no se editan: cree una migración nueva.',
          );
        }
        console.log(`  ya aplicada  ${file.version}`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(file.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
          [file.version, file.checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Falló la migración "${file.version}" (no se aplicó nada de ella): ${reason}`);
      }
      console.log(`  APLICADA     ${file.version}`);
      newCount++;
    }

    console.log(
      newCount === 0
        ? '\nLa base de datos ya estaba al día.'
        : `\nListo: se aplicaron ${newCount} migración(es).`,
    );
  } finally {
    // Soltar el candado es un cuidado extra: se libera solo al cerrar la
    // conexión, pero así queda explícito.
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

console.log('Aplicando migraciones...');
migrate()
  .catch((error: unknown) => {
    console.error(`\nERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
