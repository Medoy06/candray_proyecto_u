// =============================================================================
// entorno.ts
// Lee las variables de entorno (archivo backend/.env), las valida y las
// expone ya convertidas al tipo correcto en el objeto `env`.
//
// Por qué existe: si una variable falta o está mal escrita, el servidor debe
// negarse a arrancar y decir exactamente cuál, en lugar de fallar más tarde
// con un error confuso. Ningún otro archivo lee process.env directamente:
// todos importan `env` de aquí.
// =============================================================================
import dotenv from 'dotenv';
import { z } from 'zod';
import { PERMISSION_PROFILES } from './permisos';

// Carga backend/.env en process.env. "quiet" evita el mensaje publicitario que
// dotenv imprime en cada arranque.
dotenv.config({ quiet: true });

// Número entero dentro de un rango. Las variables de entorno siempre llegan
// como texto, por eso se usa z.coerce (convierte "5432" en 5432).
const integer = (min: number, max: number) =>
  z.coerce
    .number({ invalid_type_error: 'debe ser un número' })
    .int('debe ser un número entero')
    .min(min, `debe ser como mínimo ${min}`)
    .max(max, `debe ser como máximo ${max}`);

// Texto que no puede estar vacío.
const requiredText = z.string().min(1, 'no puede estar vacía');

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'], {
      errorMap: () => ({ message: 'debe ser development, production o test' }),
    })
    .default('development'),
  PORT: integer(1, 65535).default(3000),

  // Conexión a PostgreSQL
  DB_HOST: requiredText,
  DB_PORT: integer(1, 65535).default(5432),
  DB_NAME: requiredText,
  DB_USER: requiredText,
  DB_PASSWORD: requiredText,

  // Seguridad
  JWT_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  BCRYPT_ROUNDS: integer(4, 15).default(10),

  // Perfil de permisos (sección 7 del documento de diseño)
  PERFIL_PERMISOS: z
    .enum(PERMISSION_PROFILES, {
      errorMap: () => ({ message: 'debe ser demostracion o estricto' }),
    })
    .default('demostracion'),

  // Opcional: tope de intentos de inicio de sesión por IP
  AUTH_RATE_LIMIT_MAX: integer(1, 100000).optional(),
});

export type Env = z.infer<typeof envSchema>;

// Valida y devuelve las variables. Si hay problemas, muestra TODOS a la vez
// (no uno por uno) y termina el proceso con código 1. Nunca imprime los
// valores, solo los nombres, para no filtrar secretos en la consola.
function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (result.success) {
    return result.data;
  }

  console.error('\nERROR: la configuración del entorno no es válida (backend/.env):');
  for (const issue of result.error.issues) {
    const name = String(issue.path[0]);
    const missing =
      issue.code === 'invalid_type' && issue.received === 'undefined';
    console.error(`  - ${name}: ${missing ? 'falta (no está definida)' : issue.message}`);
  }
  console.error('\nRevise backend/.env.example para ver todas las variables.\n');
  process.exit(1);
}

export const env: Env = loadEnv();
