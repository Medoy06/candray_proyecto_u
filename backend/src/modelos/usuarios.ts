// =============================================================================
// usuarios.ts (modelo)
// Qué hace:     todas las consultas SQL sobre la tabla users: buscar, crear,
//               verificar contraseñas y llevar la cuenta de intentos fallidos.
// Requerimiento: autenticación y bloqueo de cuenta (sección 8).
// Depende de:   configuracion/baseDatos.ts, entorno.ts, negocio.ts, roles.ts.
// Lo usan:      utilidades/bloqueoCuenta.ts y los controladores de
//               autenticación y usuarios.
//
// Solo SQL y contraseñas: este archivo no decide permisos ni qué mensaje ver el
// usuario. Las contraseñas se guardan con bcrypt y el hash NUNCA sale en
// SafeUser (que es lo único que devuelve la API).
// =============================================================================
import bcrypt from 'bcryptjs';
import { pool } from '../configuracion/baseDatos';
import { env } from '../configuracion/entorno';
import { TIME_ZONE } from '../configuracion/negocio';
import type { Role } from '../configuracion/roles';

// Hora local actual de El Salvador, como expresión SQL. Se calcula en la base
// de datos (no en Node) para que TODAS las horas vengan del mismo reloj.
// Es una constante del programa, nunca texto del usuario: no hay riesgo de
// inyección SQL al insertarla en las consultas.
const LOCAL_NOW = `(now() AT TIME ZONE '${TIME_ZONE}')`;

// Fila completa de users, con el cálculo de cuánto falta para el desbloqueo.
export interface User {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: Role;
  is_active: boolean;
  failed_login_attempts: number;
  locked_until: string | null;
  last_login: string | null;
  created_at: string;
  // Minutos (redondeados hacia arriba) que faltan para que termine el bloqueo;
  // 0 si la cuenta no está bloqueada. Lo calcula la base de datos.
  lock_minutes_left: number;
}

// Lo que la API puede mostrar de un usuario: nunca el hash ni el estado de bloqueo.
export interface SafeUser {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

// Busca un usuario por correo, SIN importar si está activo, para que el login
// pueda distinguir "cuenta desactivada" de "cuenta inexistente" (hacia afuera
// ambos dan el mismo mensaje).
// Recibe: el correo (se compara sin distinguir mayúsculas).
// Devuelve: el usuario, o null si no existe.
export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT id, full_name, email, password_hash, role, is_active,
            failed_login_attempts, locked_until, last_login, created_at,
            CASE WHEN locked_until > ${LOCAL_NOW}
                 THEN CEIL(EXTRACT(EPOCH FROM (locked_until - ${LOCAL_NOW})) / 60)::int
                 ELSE 0
            END AS lock_minutes_left
       FROM users
      WHERE lower(email) = lower($1)`,
    [email],
  );
  return result.rows[0] ?? null;
}

// Busca un usuario ACTIVO por id.
// Recibe: el id. Devuelve: los datos seguros, o null si no existe o está inactivo.
export async function findUserById(id: string): Promise<SafeUser | null> {
  const result = await pool.query<SafeUser>(
    `SELECT id, full_name, email, role, is_active, last_login, created_at
       FROM users
      WHERE id = $1 AND is_active = true`,
    [id],
  );
  return result.rows[0] ?? null;
}

// Crea un usuario nuevo. La contraseña se guarda con bcrypt.
// Recibe: nombre, correo, contraseña en texto y rol.
// Devuelve: los datos seguros del usuario creado.
// Lanza error: si el correo ya existe (el índice único de la base lo impide).
export async function createUser(data: {
  full_name: string;
  email: string;
  password: string;
  role: Role;
}): Promise<SafeUser> {
  const passwordHash = await bcrypt.hash(data.password, env.BCRYPT_ROUNDS);
  const result = await pool.query<SafeUser>(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, lower($2), $3, $4)
     RETURNING id, full_name, email, role, is_active, last_login, created_at`,
    [data.full_name, data.email, passwordHash, data.role],
  );
  return result.rows[0];
}

// Compara una contraseña escrita con el hash guardado.
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Hash que sirve SOLO para gastar el mismo tiempo de CPU cuando el correo no
// existe. Sin esto, "correo inexistente" respondería en milisegundos y uno real
// en cientos, y quien mida los tiempos podría descubrir qué correos están
// registrados. Se crea la primera vez que se necesita, ya con BCRYPT_ROUNDS.
let dummyHash: Promise<string> | null = null;

// Gasta el mismo tiempo que una verificación real de contraseña.
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= bcrypt.hash('contrasena-que-no-existe', env.BCRYPT_ROUNDS);
  await bcrypt.compare(password, await dummyHash);
}

// Resultado de contar un intento fallido.
export interface FailedLoginResult {
  locked: boolean;   // true si ESTE intento fue el que bloqueó la cuenta
  attempts: number;  // contador después del intento (0 si acaba de bloquearse)
}

// Cuenta UN intento fallido de forma atómica (una sola instrucción SQL), de modo
// que 10 intentos simultáneos no puedan "saltarse" el límite.
//   - Si la cuenta ya está bloqueada: no cambia nada y devuelve null. No se
//     extiende el bloqueo: así un atacante no puede mantener bloqueada a una
//     persona para siempre repitiendo intentos.
//   - Si el intento número `maxAttempts` llega: bloquea durante `lockMinutes` y
//     reinicia el contador a 0 (al terminar el bloqueo hay 5 intentos nuevos).
// Recibe: id del usuario, intentos máximos y minutos de bloqueo.
// Devuelve: el resultado, o null si la cuenta ya estaba bloqueada.
export async function registerFailedLogin(
  userId: string,
  maxAttempts: number,
  lockMinutes: number,
): Promise<FailedLoginResult | null> {
  const result = await pool.query<{ failed_login_attempts: number; is_locked: boolean }>(
    `UPDATE users
        SET failed_login_attempts =
              CASE WHEN failed_login_attempts + 1 >= $2::int THEN 0
                   ELSE failed_login_attempts + 1 END,
            locked_until =
              CASE WHEN failed_login_attempts + 1 >= $2::int
                   THEN ${LOCAL_NOW} + make_interval(mins => $3::int)
                   ELSE locked_until END
      WHERE id = $1
        AND (locked_until IS NULL OR locked_until <= ${LOCAL_NOW})
  RETURNING failed_login_attempts,
            (locked_until > ${LOCAL_NOW}) AS is_locked`,
    [userId, maxAttempts, lockMinutes],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { locked: row.is_locked, attempts: row.failed_login_attempts };
}

// Registra un inicio de sesión correcto: reinicia el contador de fallos, quita
// cualquier bloqueo vencido y anota la hora del último acceso.
export async function markLoginSuccess(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users
        SET failed_login_attempts = 0,
            locked_until = NULL,
            last_login = ${LOCAL_NOW}
      WHERE id = $1`,
    [userId],
  );
}
