// =============================================================================
// gestionUsuarios.ts (modelo)
// Qué hace:     consultas SQL de la ADMINISTRACIÓN de usuarios: listar, crear,
//               modificar, asignar sucursales, desbloquear y cambiar contraseña.
// Requerimiento: capacidad users_manage (sección 7 del documento de diseño).
// Depende de:   configuracion/baseDatos.ts, entorno.ts, negocio.ts, roles.ts.
// Lo usa:       servicios/gestionUsuarios.ts.
//
// Se separa de modelos/usuarios.ts (que sirve al inicio de sesión) para que
// cada archivo tenga un solo propósito. Las funciones reciben `db`: puede ser
// el pool (consulta suelta) o la conexión `tx` de una transacción.
// Solo SQL: las reglas ("no puede desactivarse a sí mismo", etc.) viven en el
// servicio. Nada de aquí devuelve el hash de la contraseña.
// =============================================================================
import bcrypt from 'bcryptjs';
import type { Pool, PoolClient } from 'pg';
import { env } from '../configuracion/entorno';
import { TIME_ZONE } from '../configuracion/negocio';
import type { Role } from '../configuracion/roles';

// Pool (consulta suelta) o conexión de transacción: ambos sirven.
export type Db = Pool | PoolClient;

// Hora local de El Salvador calculada por la base (misma idea que en usuarios.ts).
const LOCAL_NOW = `(now() AT TIME ZONE '${TIME_ZONE}')`;

// Sucursal asignada a un usuario, tal como se muestra en la administración.
export interface AssignedBranch {
  id: string;
  code: string;
  name: string;
  is_default: boolean;
}

// Usuario con sus sucursales y si su cuenta está bloqueada ahora mismo.
export interface ManagedUser {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  is_locked: boolean;
  branches: AssignedBranch[]; // la predeterminada primero
}

// Columnas que se devuelven de un usuario. Nunca password_hash.
const MANAGED_USER_SELECT = `
  SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.last_login, u.created_at,
         COALESCE(u.locked_until > ${LOCAL_NOW}, false) AS is_locked,
         COALESCE((
           SELECT json_agg(
                    json_build_object('id', b.id, 'code', b.code, 'name', b.name,
                                      'is_default', ub.is_default)
                    ORDER BY ub.is_default DESC, b.name)
             FROM user_branches ub
             JOIN branches b ON b.id = ub.branch_id
            WHERE ub.user_id = u.id
         ), '[]'::json) AS branches
    FROM users u`;

// Filtros opcionales del listado.
export interface UserFilters {
  role?: Role;
  is_active?: boolean;
  search?: string; // parte del nombre o del correo
}

// Máximo de usuarios que devuelve el listado. Es una clínica, no una red social:
// con este tope una consulta nunca devuelve una cantidad descontrolada.
const LIST_LIMIT = 500;

// Lista usuarios con sus sucursales, ordenados por nombre.
// La búsqueda usa position() y no LIKE: así un "%" o "_" escrito por la persona
// se busca como texto normal y no como comodín.
export async function listManagedUsers(db: Db, filters: UserFilters): Promise<ManagedUser[]> {
  const result = await db.query<ManagedUser>(
    `${MANAGED_USER_SELECT}
      WHERE ($1::user_role IS NULL OR u.role = $1::user_role)
        AND ($2::boolean   IS NULL OR u.is_active = $2::boolean)
        AND ($3::text      IS NULL
             OR position(lower($3::text) in lower(u.full_name)) > 0
             OR position(lower($3::text) in lower(u.email)) > 0)
      ORDER BY u.full_name, u.id
      LIMIT ${LIST_LIMIT}`,
    [filters.role ?? null, filters.is_active ?? null, filters.search ?? null],
  );
  return result.rows;
}

// Busca un usuario (activo o no) con sus sucursales. Devuelve null si no existe.
export async function findManagedUser(db: Db, id: string): Promise<ManagedUser | null> {
  const result = await db.query<ManagedUser>(`${MANAGED_USER_SELECT} WHERE u.id = $1`, [id]);
  return result.rows[0] ?? null;
}

// Datos mínimos de un usuario que las reglas necesitan.
export interface UserRuleRow {
  id: string;
  role: Role;
  is_active: boolean;
  full_name: string;
}

// Lee un usuario y BLOQUEA su fila hasta terminar la transacción (FOR UPDATE):
// si dos administradores lo modifican a la vez, el segundo espera al primero.
export async function lockUser(tx: PoolClient, id: string): Promise<UserRuleRow | null> {
  const result = await tx.query<UserRuleRow>(
    'SELECT id, role, is_active, full_name FROM users WHERE id = $1 FOR UPDATE',
    [id],
  );
  return result.rows[0] ?? null;
}

// Ids de los administradores activos.
export async function listActiveAdminIds(db: Db): Promise<string[]> {
  const result = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'admin' AND is_active = true`,
  );
  return result.rows.map((row) => row.id);
}

// Encripta una contraseña con bcrypt (el costo sale del entorno).
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

// Inserta un usuario. Recibe el hash ya calculado (no la contraseña).
// Devuelve: el id. Lanza error 23505 si el correo ya existe.
export async function insertUser(
  tx: PoolClient,
  data: { full_name: string; email: string; password_hash: string; role: Role },
): Promise<string> {
  const result = await tx.query<{ id: string }>(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, lower($2), $3, $4)
     RETURNING id`,
    [data.full_name, data.email, data.password_hash, data.role],
  );
  return result.rows[0].id;
}

// Cambia nombre, rol y/o estado. Un campo en null/undefined se deja como está.
export async function updateUserFields(
  tx: PoolClient,
  id: string,
  changes: { full_name?: string; role?: Role; is_active?: boolean },
): Promise<void> {
  await tx.query(
    `UPDATE users
        SET full_name = COALESCE($2, full_name),
            role      = COALESCE($3::user_role, role),
            is_active = COALESCE($4::boolean, is_active)
      WHERE id = $1`,
    [id, changes.full_name ?? null, changes.role ?? null, changes.is_active ?? null],
  );
}

// Cuántas de las sucursales indicadas existen en la base.
export async function countExistingBranches(db: Db, branchIds: string[]): Promise<number> {
  const result = await db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM branches WHERE id = ANY($1::uuid[])',
    [branchIds],
  );
  return result.rows[0].n;
}

// Cuántas sucursales tiene asignadas un usuario.
export async function countUserBranches(db: Db, userId: string): Promise<number> {
  const result = await db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM user_branches WHERE user_id = $1',
    [userId],
  );
  return result.rows[0].n;
}

// Reemplaza TODAS las sucursales de un usuario por las indicadas.
// Recibe: ids de sucursal (sin repetir) y cuál es la predeterminada (debe estar
// en la lista; con lista vacía se ignora). Debe llamarse dentro de una transacción.
export async function replaceUserBranches(
  tx: PoolClient,
  userId: string,
  branchIds: string[],
  defaultBranchId: string | undefined,
): Promise<void> {
  await tx.query('DELETE FROM user_branches WHERE user_id = $1', [userId]);
  const defaultId = defaultBranchId ?? branchIds[0];
  for (const branchId of branchIds) {
    await tx.query(
      'INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, $3)',
      [userId, branchId, branchId === defaultId],
    );
  }
}

// Quita el bloqueo de una cuenta y reinicia su contador de intentos fallidos.
export async function clearAccountLock(db: Db, userId: string): Promise<void> {
  await db.query(
    'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
    [userId],
  );
}

// Guarda un hash nuevo de contraseña. También levanta el bloqueo: quien recibe
// una contraseña nueva debe poder entrar.
export async function setPasswordHash(db: Db, userId: string, hash: string): Promise<void> {
  await db.query(
    `UPDATE users
        SET password_hash = $2, failed_login_attempts = 0, locked_until = NULL
      WHERE id = $1`,
    [userId, hash],
  );
}
