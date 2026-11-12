// =============================================================================
// baseDatos.ts
// Crea y exporta el "pool" de conexiones a PostgreSQL que usa todo el backend.
//
// Un pool mantiene varias conexiones abiertas y las reparte entre las
// peticiones, en lugar de abrir una conexión nueva por cada consulta.
//
// Este archivo también fija cómo se leen dos tipos de fecha (ver abajo). Es
// importante que se importe antes de hacer cualquier consulta, y por eso todo
// el código obtiene el pool de aquí y nunca crea otro.
// =============================================================================
import { Pool, types } from 'pg';
import { env } from './entorno';

// -----------------------------------------------------------------------------
// Fechas sin zona horaria
// La base guarda las fechas y horas como "timestamp" (sin zona) en hora local
// de El Salvador. Por defecto, la librería pg convierte esos valores en objetos
// Date de JavaScript usando la zona del servidor, lo que puede correr la hora
// o el día sin avisar. Para evitarlo se devuelven como TEXTO, tal como están
// en la base (ejemplo: "2026-11-11 19:47:08.584556" o "2026-11-11").
// -----------------------------------------------------------------------------
types.setTypeParser(types.builtins.TIMESTAMP, (value: string) => value);
types.setTypeParser(types.builtins.DATE, (value: string) => value);

// Nota: los tipos numéricos (NUMERIC, BIGINT) ya llegan como texto por defecto.
// Eso es intencional: el dinero NUMERIC(10,2) no debe pasar por decimales
// binarios de JavaScript hasta que sea necesario calcular.

export const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  // Cada conexión nueva trabaja con la hora de El Salvador (UTC-6, sin horario
  // de verano), para que now() y las comparaciones sean coherentes.
  options: '-c timezone=America/El_Salvador',
});

// Si una conexión inactiva del pool se cae (por ejemplo, se reinició
// PostgreSQL), pg emitiría un error sin dueño y el proceso terminaría. Con este
// manejador el error se registra y el pool abre una conexión nueva cuando haga
// falta.
pool.on('error', (error: Error) => {
  console.error('Error en una conexión inactiva de la base de datos:', error.message);
});

// Cierra todas las conexiones. Se usa al terminar scripts (como migrar.ts) y
// al apagar el servidor, para que el proceso pueda salir.
export async function closeDatabase(): Promise<void> {
  await pool.end();
}
