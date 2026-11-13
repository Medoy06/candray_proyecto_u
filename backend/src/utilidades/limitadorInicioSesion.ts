// =============================================================================
// limitadorInicioSesion.ts
// Qué hace:     crea el manejador que se ejecuta cuando el limitador por IP
//               (express-rate-limit) empieza a bloquear solicitudes de inicio
//               de sesión: responde 429 y deja UNA fila en la auditoría.
// Requerimiento: primera barrera contra adivinar contraseñas (sección 8); la
//               barrera principal es el bloqueo de cuenta (bloqueoCuenta.ts).
// Depende de:   utilidades/auditoriaAutenticacion.ts.
// Lo usa:       app.ts.
//
// Por qué hace falta: express-rate-limit responde 429 ANTES de que corra el
// controlador de login. Sin este manejador, un ataque dejaría una fila por cada
// intento fallido hasta llegar al límite y luego silencio total, que es
// justo el momento que importa. Se registra el bloqueo UNA sola vez por ventana
// (el primer intento bloqueado, cuando used === limit + 1) y no por cada
// intento bloqueado: si no, un atacante podría llenar la tabla de auditoría.
// =============================================================================
import type { NextFunction, Request, Response } from 'express';
import type { Options } from 'express-rate-limit';
import { logLoginRateLimited } from './auditoriaAutenticacion';

// Datos que express-rate-limit deja en req.rateLimit.
interface RateInfo {
  limit: number;
  used: number;
}

// Crea el manejador.
// Recibe: la duración de la ventana en minutos (solo para dejarla en la auditoría).
// Devuelve: la función que express-rate-limit llama al bloquear.
export function createLoginRateLimitHandler(windowMinutes: number) {
  return (req: Request, res: Response, _next: NextFunction, options: Options): void => {
    const info = (req as unknown as { rateLimit?: RateInfo }).rateLimit;
    if (info && info.used === info.limit + 1) {
      void logLoginRateLimited({ limit: info.limit, windowMinutes, ip: req.ip });
    }
    res.status(options.statusCode).json(options.message);
  };
}
