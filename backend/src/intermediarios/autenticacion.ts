// =============================================================================
// autenticacion.ts (intermediario)
// Qué hace:     authenticate: comprueba el token de cada petición protegida y
//               deja al usuario en req.user.
//               createCan / can: comprueban que el rol del usuario tenga la
//               capacidad que exige la ruta.
// Requerimiento: control de acceso por rol (sección 7).
// Depende de:   utilidades/token.ts, modelos/usuarios.ts, configuracion/permisos.ts.
// Lo usan:      todas las rutas protegidas (app.ts y archivos de rutas).
//
// Decisión de seguridad: además de verificar la firma del token, authenticate
// consulta el usuario en la base en cada petición y usa el rol ACTUAL de la
// base, no el que trae el token. Así, desactivar a un usuario o cambiarle el
// rol se aplica de inmediato y no hasta que su token venza (hasta 8 horas).
// Cuesta una consulta pequeña por petición, un precio aceptable.
// =============================================================================
import type { NextFunction, Request, Response } from 'express';
import { env } from '../configuracion/entorno';
import {
  buildPermissions,
  hasCapability,
  type Capability,
  type PermissionMap,
} from '../configuracion/permisos';
import { findUserById } from '../modelos/usuarios';
import { verifyToken, type AuthPayload } from '../utilidades/token';

// Le dice a TypeScript que, tras authenticate, la petición lleva `user`.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

// Responde 401 con el mensaje dado.
function reject(res: Response, message: string): void {
  res.status(401).json({ success: false, message });
}

// Comprueba el token "Authorization: Bearer <token>" de la petición.
// Si es válido y el usuario sigue activo, guarda en req.user su identidad (con
// el rol actual de la base) y continúa. Si no, responde 401.
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    reject(res, 'Acceso no autorizado. Token requerido.');
    return;
  }

  let payload: AuthPayload;
  try {
    payload = verifyToken(header.slice('Bearer '.length));
  } catch {
    reject(res, 'Token inválido o expirado.');
    return;
  }

  // findUserById solo devuelve usuarios ACTIVOS.
  const user = await findUserById(payload.userId);
  if (!user) {
    reject(res, 'Token inválido o expirado.');
    return;
  }

  req.user = { userId: user.id, email: user.email, role: user.role };
  next();
}

// Crea el intermediario "can" para un mapa de permisos concreto.
// Existe separado de `can` para poder probar los dos perfiles en las pruebas.
// Recibe: el mapa de permisos. Devuelve: una función can(capacidad).
export function createCan(permissions: PermissionMap) {
  return (capability: Capability) =>
    (req: Request, res: Response, next: NextFunction): void => {
      if (!req.user) {
        reject(res, 'Acceso no autorizado.');
        return;
      }
      if (!hasCapability(permissions, req.user.role, capability)) {
        res.status(403).json({
          success: false,
          message: 'No tiene permisos para realizar esta acción.',
        });
        return;
      }
      next();
    };
}

// can('<capacidad>') con el perfil de permisos activo (PERFIL_PERMISOS).
// Uso en una ruta:  router.get('/', can('appointments_read'), controlador)
export const can = createCan(buildPermissions(env.PERFIL_PERMISOS));
