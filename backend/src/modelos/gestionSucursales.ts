// =============================================================================
// gestionSucursales.ts (modelo)
// Qué hace:     consultas SQL de la ADMINISTRACIÓN de sucursales: listar (con
//               las inactivas), crear, leer y modificar.
// Requerimiento: capacidad branches_manage (sección 7 del documento de diseño).
// Depende de:   configuracion/baseDatos.ts.
// Lo usa:       servicios/gestionSucursales.ts.
//
// Distinto de modelos/sucursales.ts, que solo devuelve las sucursales ACTIVAS a
// las que un usuario puede entrar. Aquí se ven todas. Las sucursales nunca se
// borran: se desactivan (is_active = false).
// =============================================================================
import type { PoolClient } from 'pg';
import { pool } from '../configuracion/baseDatos';

export interface ManagedBranch {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  opening_time: string;      // "HH:MM:SS"
  closing_time: string;      // "HH:MM:SS"
  theme_color: string;
  has_optical_counter: boolean;
  is_active: boolean;
  created_at: string;
  user_count: number;        // usuarios asignados (los administradores y directivos no cuentan: ven todas)
}

const BRANCH_SELECT = `
  SELECT b.id, b.code, b.name, b.address, b.phone, b.opening_time, b.closing_time,
         b.theme_color, b.has_optical_counter, b.is_active, b.created_at,
         (SELECT count(*)::int FROM user_branches ub WHERE ub.branch_id = b.id) AS user_count
    FROM branches b`;

// Lista todas las sucursales, activas primero y luego por nombre.
export async function listManagedBranches(): Promise<ManagedBranch[]> {
  const result = await pool.query<ManagedBranch>(
    `${BRANCH_SELECT} ORDER BY b.is_active DESC, b.name`,
  );
  return result.rows;
}

// Busca una sucursal por id. Devuelve null si no existe.
// Si recibe `tx`, bloquea la fila (FOR UPDATE) hasta terminar la transacción.
export async function findManagedBranch(id: string, tx?: PoolClient): Promise<ManagedBranch | null> {
  const db = tx ?? pool;
  const result = await db.query<ManagedBranch>(
    `${BRANCH_SELECT} WHERE b.id = $1 ${tx ? 'FOR UPDATE OF b' : ''}`,
    [id],
  );
  return result.rows[0] ?? null;
}

// Campos que se pueden escribir en una sucursal.
export interface BranchFields {
  name: string;
  address: string | null;
  phone: string | null;
  opening_time: string;
  closing_time: string;
  theme_color: string;
  has_optical_counter: boolean;
  is_active: boolean;
}

// Inserta una sucursal. Devuelve su id. Lanza error 23505 si el código ya existe.
export async function insertBranch(code: string, fields: BranchFields): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO branches
       (code, name, address, phone, opening_time, closing_time,
        theme_color, has_optical_counter, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      code, fields.name, fields.address, fields.phone, fields.opening_time,
      fields.closing_time, fields.theme_color, fields.has_optical_counter, fields.is_active,
    ],
  );
  return result.rows[0].id;
}

// Reescribe los campos de una sucursal (el código no cambia nunca).
export async function updateBranchFields(tx: PoolClient, id: string, fields: BranchFields): Promise<void> {
  await tx.query(
    `UPDATE branches
        SET name = $2, address = $3, phone = $4, opening_time = $5, closing_time = $6,
            theme_color = $7, has_optical_counter = $8, is_active = $9
      WHERE id = $1`,
    [
      id, fields.name, fields.address, fields.phone, fields.opening_time,
      fields.closing_time, fields.theme_color, fields.has_optical_counter, fields.is_active,
    ],
  );
}
