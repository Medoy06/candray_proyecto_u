// =============================================================================
// datosPrueba.ts
// Qué hace:     funciones para crear sucursales y usuarios de prueba, cada uno
//               con datos únicos, de modo que las pruebas no se estorben entre
//               sí aunque corran a la vez.
// Depende de:   configuracion/baseDatos.ts y modelos/usuarios.ts.
// Lo usan:      las pruebas que necesitan usuarios o sucursales reales.
//
// Todos los datos son ficticios: correos del dominio .test y contraseña fija.
// =============================================================================
import { randomUUID } from 'crypto';
import { pool } from '../../src/configuracion/baseDatos';
import type { Role } from '../../src/configuracion/roles';
import { createUser } from '../../src/modelos/usuarios';

// Contraseña de todos los usuarios de prueba.
export const TEST_PASSWORD = 'contrasena-de-prueba';

export interface TestBranch {
  id: string;
  code: string;
}

export interface TestUser {
  id: string;
  email: string;
}

// Crea una sucursal con código único.
// Recibe: si está activa (por defecto sí). Devuelve: su id y su código.
export async function createTestBranch(isActive = true): Promise<TestBranch> {
  // El código solo admite A-Z, 0-9 y guion bajo, hasta 20 caracteres.
  const code = `T${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  const result = await pool.query<TestBranch>(
    `INSERT INTO branches (code, name, opening_time, closing_time, is_active)
     VALUES ($1, $2, '08:00', '17:00', $3)
     RETURNING id, code`,
    [code, `Sucursal ${code}`, isActive],
  );
  return result.rows[0];
}

// Crea un usuario con correo único.
// Recibe: el rol, las sucursales que se le asignan (la primera queda como
// predeterminada) y si la cuenta está activa.
// Devuelve: su id y su correo.
export async function createTestUser(
  options: { role?: Role; branchIds?: string[]; isActive?: boolean } = {},
): Promise<TestUser> {
  const email = `${randomUUID()}@prueba.test`;
  const user = await createUser({
    full_name: 'Usuario de Prueba',
    email,
    password: TEST_PASSWORD,
    role: options.role ?? 'recepcionista',
  });

  if (options.isActive === false) {
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);
  }

  const branchIds = options.branchIds ?? [];
  for (const [index, branchId] of branchIds.entries()) {
    await pool.query(
      'INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, $3)',
      [user.id, branchId, index === 0],
    );
  }

  return { id: user.id, email };
}
