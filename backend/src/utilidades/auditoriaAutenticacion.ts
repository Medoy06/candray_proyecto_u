// =============================================================================
// auditoriaAutenticacion.ts
// Qué hace:     funciones con nombre propio para cada evento de inicio de
//               sesión que debe quedar en la bitácora de auditoría.
// Requerimiento: bloqueo de cuenta auditado (sección 8) y registro de accesos
//               (sección 10).
// Depende de:   utilidades/auditoria.ts.
// Lo usan:      el controlador de autenticación, el limitador de intentos por
//               IP y el bloqueo de cuenta.
//
// Cada evento usa entity_type = 'auth' y una acción en minúsculas con guion
// bajo (login_success, login_failed, account_locked, login_rate_limited).
// La dirección IP y los demás datos van dentro del campo `detail` (jsonb).
// =============================================================================
import { auditLog } from './auditoria';

// Motivos por los que un inicio de sesión puede fallar. El cliente siempre
// recibe el mismo mensaje genérico; la distinción queda solo en la bitácora,
// que únicamente leen administradores y directivos.
export type LoginFailureReason =
  | 'unknown_email'    // el correo no existe
  | 'bad_password'     // el correo existe pero la contraseña no coincide
  | 'account_disabled' // la cuenta está desactivada
  | 'account_locked';  // la cuenta estaba bloqueada al intentar entrar

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Texto que se guarda cuando lo escrito en el campo de correo no parece un
// correo. A veces la gente pega su contraseña en ese campo por error; si se
// guardara, quedaría una contraseña en la bitácora.
export const NOT_AN_EMAIL = '(no es un correo)';

// Decide qué se guarda del correo escrito en el intento de inicio de sesión.
// Recibe: el texto escrito. Devuelve: el correo en minúsculas, o NOT_AN_EMAIL.
export function sanitizeAttemptedEmail(attempted: string): string {
  const email = attempted.trim().toLowerCase();
  return EMAIL_LIKE.test(email) ? email : NOT_AN_EMAIL;
}

// Registra un inicio de sesión correcto, con la sucursal con la que entró.
export async function logLoginSuccess(
  userId: string,
  ip: string | undefined,
  branchId: string,
): Promise<void> {
  await auditLog({
    entityType: 'auth',
    action: 'login_success',
    actorId: userId,
    branchId,
    detail: { ip },
  });
}

// Registra un inicio de sesión fallido. No lleva actor: quien intentó entrar
// todavía no es un usuario autenticado. Si la cuenta existe, su id va en detail.
export async function logLoginFailed(params: {
  attemptedEmail: string;
  reason: LoginFailureReason;
  ip: string | undefined;
  accountId?: string;
}): Promise<void> {
  await auditLog({
    entityType: 'auth',
    action: 'login_failed',
    actorId: null,
    detail: {
      email: sanitizeAttemptedEmail(params.attemptedEmail),
      reason: params.reason,
      account_id: params.accountId,
      ip: params.ip,
    },
  });
}

// Registra que una cuenta acaba de bloquearse por intentos fallidos.
export async function logAccountLocked(params: {
  accountId: string;
  attempts: number;
  lockMinutes: number;
  ip: string | undefined;
}): Promise<void> {
  await auditLog({
    entityType: 'user',
    entityId: params.accountId,
    action: 'account_locked',
    actorId: null,
    detail: { attempts: params.attempts, lock_minutes: params.lockMinutes, ip: params.ip },
  });
}

// Registra que el limitador por IP empezó a bloquear solicitudes de inicio de
// sesión (se escribe una sola vez por ventana de tiempo).
export async function logLoginRateLimited(params: {
  limit: number;
  windowMinutes: number;
  ip: string | undefined;
}): Promise<void> {
  await auditLog({
    entityType: 'auth',
    action: 'login_rate_limited',
    actorId: null,
    detail: { limit: params.limit, window_minutes: params.windowMinutes, ip: params.ip },
  });
}
