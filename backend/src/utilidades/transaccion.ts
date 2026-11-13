// =============================================================================
// transaccion.ts (utilidad)
// Qué hace:     withTransaction(): ejecuta varias consultas como UNA sola
//               operación: o se guardan todas o no se guarda ninguna.
// Depende de:   configuracion/baseDatos.ts.
// Lo usan:      los servicios que modifican varias tablas a la vez (por
//               ejemplo, crear un usuario junto con sus sucursales).
//
// Ejemplo:
//   await withTransaction(async (tx) => {
//     await tx.query('INSERT ...');   // si la segunda consulta falla,
//     await tx.query('INSERT ...');   // la primera también se deshace
//   });
// =============================================================================
import type { PoolClient } from 'pg';
import { pool } from '../configuracion/baseDatos';

// Ejecuta `work` dentro de una transacción.
// Recibe: una función que recibe la conexión de la transacción (tx).
// Devuelve: lo que devuelva `work`. Si `work` lanza un error se deshace todo y
// el error se vuelve a lanzar para que lo maneje errorHandler.
export async function withTransaction<T>(work: (tx: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // Si el ROLLBACK mismo falla (conexión caída) se ignora: el error original
    // es el importante, y la base descarta la transacción al cerrarse la conexión.
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
