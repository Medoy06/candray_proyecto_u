// =============================================================================
// aplicarMigraciones.ts
// Qué hace:     aplica, en orden, los archivos SQL de base_datos/migraciones/
//               que todavía no se han aplicado, y lleva el registro de cuáles
//               ya se aplicaron en la tabla schema_migrations.
// Requerimiento: base de datos reproducible (sección 6 del documento de diseño).
// Depende de:   backend/src/configuracion/baseDatos.ts (el pool de conexiones).
// Lo usan:      scripts/migrar.ts (línea de comandos) y la preparación de la
//               base de pruebas (backend/pruebas/ayudas/prepararBaseDatos.ts).
//
// Reglas que hace cumplir:
//   1. Los archivos se llaman NN_nombre.sql y se numeran 01, 02, 03... sin
//      saltos ni repetidos.
//   2. Cada migración se aplica dentro de una transacción: o se aplica completa
//      o no se aplica nada.
//   3. Una migración ya aplicada NO se puede modificar. Si el archivo cambió,
//      se detiene (compara una huella SHA-256 guardada al aplicarla). Para
//      cambiar algo, se escribe una migración nueva.
//   4. Nunca corren dos ejecuciones a la vez (candado de PostgreSQL).
//
// Esta función NO cierra el pool: quien la llama decide cuándo hacerlo.
// =============================================================================
import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { pool } from '../backend/src/configuracion/baseDatos';

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

export interface ApplyOptions {
  // Dónde se escriben los mensajes de avance. Por defecto, la consola.
  log?: (message: string) => void;
}

// Lee los archivos de la carpeta y comprueba que la numeración sea 01, 02, 03...
// Devuelve: la lista de migraciones ordenada.
// Lanza error: si un nombre no cumple el formato o la numeración tiene huecos.
function readMigrationFiles(): MigrationFile[] {
  const names = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  return names.map((name, index) => {
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
}

// Aplica las migraciones pendientes.
// Recibe: opciones (opcional).
// Devuelve: cuántas migraciones nuevas se aplicaron.
// Lanza error: si una migración falla, cambió después de aplicarse, falta su
// archivo, o la numeración está rota.
export async function applyMigrations(options: ApplyOptions = {}): Promise<number> {
  const log = options.log ?? ((message: string) => console.log(message));

  const files = readMigrationFiles();
  if (files.length === 0) {
    log('No hay archivos en base_datos/migraciones/. Nada que aplicar.');
    return 0;
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
        log(`  ya aplicada  ${file.version}`);
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
      log(`  APLICADA     ${file.version}`);
      newCount++;
    }

    log(
      newCount === 0
        ? '\nLa base de datos ya estaba al día.'
        : `\nListo: se aplicaron ${newCount} migración(es).`,
    );
    return newCount;
  } finally {
    // Soltar el candado es un cuidado extra: se libera solo al cerrar la
    // conexión, pero así queda explícito.
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}
