// =============================================================================
// alcanceSucursal.ts
// Qué hace:     resuelve en qué sucursal está trabajando el usuario en cada
//               petición y qué sucursales puede usar, y lo deja en
//               req.branchScope para que los módulos filtren sus datos.
// Requerimiento: multisucursal; alcance de datos por rol (sección 7).
// Depende de:   modelos/sucursales.ts y autenticacion.ts (debe ir DESPUÉS de
//               authenticate, porque necesita req.user).
// Lo usan:      las rutas de los módulos que dependen de la sucursal.
//
// Cómo elige la sucursal activa:
//   1. Si la petición trae la cabecera  X-Sucursal-Id: <id>, se usa esa; pero
//      SOLO si el usuario tiene acceso a ella (si no, 403). La cabecera es
//      una petición del cliente, nunca una orden: siempre se verifica.
//   2. Si no trae cabecera, se usa la sucursal predeterminada del usuario.
//
// Quién ve qué sucursales: administrador y directivo, todas las activas; los
// demás roles, solo las que tienen asignadas.
//
// La sucursal NO viaja dentro del token: se consulta en la base en cada
// petición, para que quitarle una sucursal a alguien surta efecto de inmediato.
// =============================================================================
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../configuracion/roles';
import { getBranchAccess, type Branch } from '../modelos/sucursales';

// Nombre de la cabecera HTTP con la sucursal elegida (Node la pasa a minúsculas).
export const BRANCH_HEADER = 'x-sucursal-id';

// Roles que ven todas las sucursales activas sin necesidad de asignación.
const ROLES_WITH_ALL_BRANCHES: readonly Role[] = ['admin', 'directivo'];

// Indica si un rol ve todas las sucursales activas.
// Recibe: el rol. Devuelve: true para administrador y directivo.
export function seesAllBranches(role: Role): boolean {
  return ROLES_WITH_ALL_BRANCHES.includes(role);
}

// Resultado de resolver la sucursal de una petición.
export interface BranchScope {
  activeBranchId: string;      // sucursal en la que trabaja ahora
  allowedBranchIds: string[];  // todas las que puede usar (para datos de "todas mis sucursales")
  branches: Branch[];          // los datos de esas sucursales (nombre, color, horario...)
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      branchScope?: BranchScope;
    }
  }
}

// Intermediario: calcula req.branchScope.
// Responde 401 si no hay usuario autenticado, y 403 si el usuario no tiene
// sucursales o pide una a la que no tiene acceso.
export async function resolveBranchScope(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Acceso no autorizado.' });
    return;
  }

  const access = await getBranchAccess(req.user.userId, seesAllBranches(req.user.role));
  const allowedBranchIds = access.branches.map((branch) => branch.id);

  if (access.defaultBranchId === null) {
    res.status(403).json({
      success: false,
      message: 'El usuario no tiene sucursales asignadas.',
    });
    return;
  }

  const requested = req.headers[BRANCH_HEADER];
  let activeBranchId = access.defaultBranchId;

  if (typeof requested === 'string' && requested !== '') {
    if (!allowedBranchIds.includes(requested)) {
      res.status(403).json({
        success: false,
        message: 'No tiene acceso a esa sucursal.',
      });
      return;
    }
    activeBranchId = requested;
  }

  req.branchScope = { activeBranchId, allowedBranchIds, branches: access.branches };
  next();
}
