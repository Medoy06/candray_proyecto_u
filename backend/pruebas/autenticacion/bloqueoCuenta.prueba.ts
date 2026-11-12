// =============================================================================
// bloqueoCuenta.prueba.ts
// Qué prueba:   la regla "Bloqueo de cuenta" (sección 8): 5 intentos fallidos
//               seguidos bloquean la cuenta 15 minutos y se puede volver a
//               entrar al terminar ese tiempo.
// Cómo:         contra la base de datos de pruebas real (candray_test); no se
//               simulan consultas, porque lo que se quiere probar es justo lo
//               que hace la base (atomicidad, reloj, restricciones).
// Depende de:   utilidades/bloqueoCuenta.ts y modelos/usuarios.ts.
//
// Cada prueba crea su propio usuario con un correo único; así no se estorban
// entre sí aunque corran a la vez. (audit_log no se puede vaciar y no hace falta:
// la base entera se recrea en cada ejecución.)
// =============================================================================
import { randomUUID } from 'crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/configuracion/baseDatos';
import { createUser, findUserByEmail, type User } from '../../src/modelos/usuarios';
import {
  isLocked,
  recordFailedAttempt,
  recordSuccessfulLogin,
} from '../../src/utilidades/bloqueoCuenta';

// Crea un usuario de prueba con correo único y devuelve su fila completa.
async function newUser(): Promise<User> {
  const email = `${randomUUID()}@prueba.test`;
  await createUser({
    full_name: 'Usuario de Prueba',
    email,
    password: 'contrasena-de-prueba',
    role: 'recepcionista',
  });
  const user = await findUserByEmail(email);
  if (!user) throw new Error('No se pudo crear el usuario de prueba');
  return user;
}

// Cuenta N intentos fallidos seguidos y devuelve el resultado de cada uno.
async function failTimes(userId: string, times: number) {
  const outcomes = [];
  for (let i = 0; i < times; i++) {
    outcomes.push(await recordFailedAttempt(userId));
  }
  return outcomes;
}

describe('Bloqueo de cuenta', () => {
  beforeAll(async () => {
    // Si la base no estuviera lista, que falle aquí con un mensaje claro.
    await pool.query('SELECT 1');
  });

  it('una cuenta nueva no está bloqueada', async () => {
    const user = await newUser();
    expect(isLocked(user)).toBe(false);
    expect(user.failed_login_attempts).toBe(0);
  });

  it('4 intentos fallidos cuentan pero NO bloquean', async () => {
    const user = await newUser();
    const outcomes = await failTimes(user.id, 4);

    expect(outcomes.map((o) => o.kind)).toEqual(['counted', 'counted', 'counted', 'counted']);
    const after = await findUserByEmail(user.email);
    expect(after?.failed_login_attempts).toBe(4);
    expect(isLocked(after!)).toBe(false);
  });

  it('el 5.º intento fallido bloquea la cuenta entre 1 y 15 minutos', async () => {
    const user = await newUser();
    const outcomes = await failTimes(user.id, 5);

    expect(outcomes[4].kind).toBe('locked_now');
    const after = await findUserByEmail(user.email);
    expect(isLocked(after!)).toBe(true);
    expect(after!.lock_minutes_left).toBeGreaterThanOrEqual(1);
    expect(after!.lock_minutes_left).toBeLessThanOrEqual(15);
    // Al bloquearse el contador vuelve a 0.
    expect(after!.failed_login_attempts).toBe(0);
  });

  it('con la cuenta bloqueada, un intento más no cambia nada ni extiende el bloqueo', async () => {
    const user = await newUser();
    await failTimes(user.id, 5);
    const before = await findUserByEmail(user.email);

    const outcome = await recordFailedAttempt(user.id);

    const after = await findUserByEmail(user.email);
    expect(outcome.kind).toBe('already_locked');
    expect(after!.locked_until).toBe(before!.locked_until);
    expect(after!.failed_login_attempts).toBe(0);
  });

  it('al terminar el bloqueo la cuenta vuelve a funcionar y los fallos empiezan de nuevo', async () => {
    const user = await newUser();
    await failTimes(user.id, 5);

    // Se adelanta el reloj: se simula que el bloqueo terminó hace un minuto.
    await pool.query(
      `UPDATE users SET locked_until = (now() AT TIME ZONE 'America/El_Salvador') - interval '1 minute'
        WHERE id = $1`,
      [user.id],
    );

    const afterExpiry = await findUserByEmail(user.email);
    expect(isLocked(afterExpiry!)).toBe(false);

    // Un nuevo fallo cuenta como el primero.
    const outcome = await recordFailedAttempt(user.id);
    expect(outcome).toEqual({ kind: 'counted', attempts: 1 });
  });

  it('un inicio de sesión correcto reinicia el contador y quita el bloqueo', async () => {
    const user = await newUser();
    await failTimes(user.id, 3);

    await recordSuccessfulLogin(user.id);

    const after = await findUserByEmail(user.email);
    expect(after!.failed_login_attempts).toBe(0);
    expect(after!.locked_until).toBeNull();
    expect(after!.last_login).not.toBeNull();
  });

  it('10 intentos simultáneos: solo uno bloquea y el resto no se pasa del límite', async () => {
    const user = await newUser();

    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => recordFailedAttempt(user.id)),
    );

    const count = (kind: string) => outcomes.filter((o) => o.kind === kind).length;
    expect(count('locked_now')).toBe(1);
    expect(count('counted')).toBe(4);
    expect(count('already_locked')).toBe(5);
    expect(isLocked((await findUserByEmail(user.email))!)).toBe(true);
  });

  it('el correo se busca sin distinguir mayúsculas', async () => {
    const user = await newUser();
    const found = await findUserByEmail(user.email.toUpperCase());
    expect(found?.id).toBe(user.id);
  });
});
