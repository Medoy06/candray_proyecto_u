// =============================================================================
// bloqueoCuenta.ts
// Qué hace:     regla de bloqueo de cuenta: 5 intentos fallidos SEGUIDOS
//               bloquean la cuenta durante 15 minutos.
// Requerimiento: "Bloqueo de cuenta" (sección 8 del documento de diseño).
// Depende de:   modelos/usuarios.ts y configuracion/negocio.ts.
// Lo usan:      el controlador de autenticación.
//
// Por qué por cuenta y no solo por IP: todo el personal de una sucursal
// comparte la misma IP; limitar solo por IP bloquearía a toda la sucursal por
// los errores de uno, y un atacante que cambie de IP no se detendría nunca.
// El limitador por IP sigue existiendo, pero como primera barrera más holgada.
//
// Detalles de la regla:
//   - Mientras la cuenta está bloqueada, los intentos NO se cuentan ni
//     extienden el bloqueo.
//   - Al bloquearse, el contador vuelve a 0: al terminar los 15 minutos la
//     persona tiene 5 intentos nuevos.
//   - Un inicio de sesión correcto reinicia el contador.
//   - Quien consulta el reloj es la base de datos, no Node.
// =============================================================================
import { ACCOUNT_LOCK_MINUTES, MAX_FAILED_LOGIN_ATTEMPTS } from '../configuracion/negocio';
import { markLoginSuccess, registerFailedLogin } from '../modelos/usuarios';

// Indica si una cuenta está bloqueada en este momento.
// Recibe: un usuario leído con findUserByEmail (trae lock_minutes_left).
// Devuelve: true si todavía faltan minutos de bloqueo.
export function isLocked(user: { lock_minutes_left: number }): boolean {
  return user.lock_minutes_left > 0;
}

// Resultado de contar un intento fallido, para que el controlador decida qué
// responder y qué auditar.
export type FailedAttemptOutcome =
  | { kind: 'counted'; attempts: number }   // se contó; todavía no se bloquea
  | { kind: 'locked_now'; attempts: number } // este intento bloqueó la cuenta
  | { kind: 'already_locked' };             // la cuenta ya estaba bloqueada

// Cuenta un intento fallido con los límites acordados (5 y 15 minutos).
// Recibe: el id del usuario. Devuelve: qué ocurrió con ese intento.
export async function recordFailedAttempt(userId: string): Promise<FailedAttemptOutcome> {
  const result = await registerFailedLogin(userId, MAX_FAILED_LOGIN_ATTEMPTS, ACCOUNT_LOCK_MINUTES);
  if (result === null) return { kind: 'already_locked' };
  return result.locked
    ? { kind: 'locked_now', attempts: MAX_FAILED_LOGIN_ATTEMPTS }
    : { kind: 'counted', attempts: result.attempts };
}

// Registra un inicio de sesión correcto (reinicia el contador).
export async function recordSuccessfulLogin(userId: string): Promise<void> {
  await markLoginSuccess(userId);
}
