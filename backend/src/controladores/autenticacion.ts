// =============================================================================
// autenticacion.ts (controlador)
// Qué hace:     inicio de sesión (login) y datos de la sesión actual (getMe).
// Requerimiento: autenticación y bloqueo de cuenta (sección 8).
// Depende de:   modelos/usuarios.ts y sucursales.ts, utilidades/bloqueoCuenta.ts,
//               token.ts y auditoriaAutenticacion.ts.
// Lo usan:      rutas/autenticacion.ts.
//
// Regla de privacidad del login: TODO fallo (correo inexistente, contraseña
// incorrecta, cuenta desactivada) devuelve el MISMO mensaje y tarda casi lo
// mismo, para que nadie pueda averiguar qué correos existen. La distinción
// queda solo en la auditoría. La única excepción acordada es el bloqueo de
// cuenta, que sí se informa (423) para que quien se quedó sin acceso sepa por
// qué y cuándo puede volver a intentar.
// =============================================================================
import type { Request, Response } from 'express';
import { ACCOUNT_LOCK_MINUTES } from '../configuracion/negocio';
import { env } from '../configuracion/entorno';
import { buildPermissions, capabilitiesForRole } from '../configuracion/permisos';
import { seesAllBranches } from '../intermediarios/alcanceSucursal';
import { getBranchAccess } from '../modelos/sucursales';
import { burnPasswordCheck, findUserById, findUserByEmail, verifyPassword } from '../modelos/usuarios';
import type { LoginInput } from '../esquemas/autenticacion';
import {
  logAccountLocked,
  logLoginFailed,
  logLoginSuccess,
} from '../utilidades/auditoriaAutenticacion';
import { isLocked, recordFailedAttempt, recordSuccessfulLogin } from '../utilidades/bloqueoCuenta';
import { signToken } from '../utilidades/token';

// Mapa de permisos del perfil activo (PERFIL_PERMISOS). Se arma una sola vez.
const permissions = buildPermissions(env.PERFIL_PERMISOS);

// Respuesta única para cualquier fallo de credenciales.
function respondBadCredentials(res: Response): void {
  res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
}

// Respuesta de cuenta bloqueada: 423 (Locked), con el tiempo de espera.
function respondLocked(res: Response, minutes: number): void {
  res.set('Retry-After', String(minutes * 60)); // en segundos, como pide HTTP
  res.status(423).json({
    success: false,
    message: `La cuenta está bloqueada temporalmente. Intente de nuevo en ${minutes} minutos.`,
    retry_after_minutes: minutes,
  });
}

// POST /api/auth/login
// Recibe (ya validado): { email, password }.
// Responde: 200 con { token, user, capabilities, branches, activeBranchId }; 401 con
// credenciales incorrectas; 403 si el usuario no tiene sucursales; 423 si la
// cuenta está bloqueada.
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;
  const ip = req.ip;

  const user = await findUserByEmail(email);

  // 1) Correo inexistente. Se gasta el mismo tiempo que una comprobación real.
  if (!user) {
    await burnPasswordCheck(password);
    await logLoginFailed({ attemptedEmail: email, reason: 'unknown_email', ip });
    respondBadCredentials(res);
    return;
  }

  // 2) Cuenta bloqueada: se rechaza sin mirar la contraseña (aunque fuera la
  //    correcta, no se entra durante el bloqueo) y sin contar el intento.
  if (isLocked(user)) {
    await logLoginFailed({ attemptedEmail: email, reason: 'account_locked', ip, accountId: user.id });
    respondLocked(res, user.lock_minutes_left);
    return;
  }

  const passwordMatches = await verifyPassword(password, user.password_hash);

  // 3) Cuenta desactivada. Se comprueba la contraseña igualmente (mismo costo)
  //    y no se cuenta como intento: bloquear una cuenta ya inactiva no sirve.
  if (!user.is_active) {
    await logLoginFailed({ attemptedEmail: email, reason: 'account_disabled', ip, accountId: user.id });
    respondBadCredentials(res);
    return;
  }

  // 4) Contraseña incorrecta: se cuenta el intento; el quinto bloquea.
  if (!passwordMatches) {
    const outcome = await recordFailedAttempt(user.id);
    await logLoginFailed({ attemptedEmail: email, reason: 'bad_password', ip, accountId: user.id });

    if (outcome.kind === 'locked_now') {
      await logAccountLocked({
        accountId: user.id,
        attempts: outcome.attempts,
        lockMinutes: ACCOUNT_LOCK_MINUTES,
        ip,
      });
      respondLocked(res, ACCOUNT_LOCK_MINUTES);
    } else if (outcome.kind === 'already_locked') {
      // Otro intento simultáneo bloqueó la cuenta justo antes que este.
      respondLocked(res, ACCOUNT_LOCK_MINUTES);
    } else {
      respondBadCredentials(res);
    }
    return;
  }

  // 5) Credenciales correctas. Se reinicia el contador y se buscan sus sucursales.
  await recordSuccessfulLogin(user.id);
  const access = await getBranchAccess(user.id, seesAllBranches(user.role));

  if (access.defaultBranchId === null) {
    res.status(403).json({
      success: false,
      message: 'El usuario no tiene sucursales asignadas. Contacte al administrador.',
    });
    return;
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  await logLoginSuccess(user.id, ip, access.defaultBranchId);

  res.json({
    success: true,
    data: {
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
      capabilities: capabilitiesForRole(permissions, user.role),
      branches: access.branches,
      activeBranchId: access.defaultBranchId,
    },
  });
}

// GET /api/auth/me   (requiere authenticate y resolveBranchScope antes)
// Responde: los datos de la sesión actual: el usuario, sus capacidades, las
// sucursales que puede usar y la sucursal activa de esta petición (la de la cabecera X-Sucursal-Id,
// o la predeterminada).
export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await findUserById(req.user!.userId);
  if (!user) {
    res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    return;
  }

  const scope = req.branchScope!;
  res.json({
    success: true,
    data: {
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
      capabilities: capabilitiesForRole(permissions, user.role),
      branches: scope.branches,
      activeBranchId: scope.activeBranchId,
    },
  });
}
