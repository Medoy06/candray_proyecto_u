// =============================================================================
// sucursales.ts (modelo)
// Qué hace:     consultas SQL sobre las sucursales a las que un usuario puede
//               acceder.
// Requerimiento: multisucursal (sección 7: alcance de datos por rol).
// Depende de:   configuracion/baseDatos.ts.
// Lo usan:      el controlador de autenticación y el intermediario
//               alcanceSucursal.ts.
//
// Solo SQL: la regla de "qué roles ven todas las sucursales" la decide quien
// llama (parámetro seesAllBranches); este archivo no conoce los roles.
// =============================================================================
import { pool } from '../configuracion/baseDatos';

// Datos de una sucursal tal como los usa la interfaz.
export interface Branch {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  opening_time: string;
  closing_time: string;
  theme_color: string;
  has_optical_counter: boolean;
}

// Sucursales a las que un usuario puede acceder, con la predeterminada primero.
export interface BranchAccess {
  branches: Branch[];
  defaultBranchId: string | null;
}

// Devuelve las sucursales ACTIVAS que un usuario puede usar.
//   - Si seesAllBranches es true (administrador, directivo): todas las activas.
//   - Si es false: solo las que tiene asignadas en user_branches.
// La sucursal predeterminada del usuario (is_default) queda primera; el resto
// va en orden alfabético. Si no tiene predeterminada, la primera por nombre.
// Recibe: id del usuario y si ve todas las sucursales.
// Devuelve: la lista y el id de la predeterminada (null si no hay ninguna).
export async function getBranchAccess(
  userId: string,
  seesAllBranches: boolean,
): Promise<BranchAccess> {
  const result = await pool.query<Branch>(
    `SELECT b.id, b.code, b.name, b.address, b.phone,
            b.opening_time, b.closing_time, b.theme_color, b.has_optical_counter
       FROM branches b
       LEFT JOIN user_branches ub ON ub.branch_id = b.id AND ub.user_id = $1
      WHERE b.is_active
        AND ($2::boolean OR ub.user_id IS NOT NULL)
      ORDER BY COALESCE(ub.is_default, false) DESC, b.name`,
    [userId, seesAllBranches],
  );
  return {
    branches: result.rows,
    defaultBranchId: result.rows[0]?.id ?? null,
  };
}
