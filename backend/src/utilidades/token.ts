// =============================================================================
// token.ts
// Qué hace:     crea y verifica los tokens de sesión (JWT firmados con HS256).
// Requerimiento: autenticación; la identidad sale SIEMPRE del token (sección 8).
// Depende de:   configuracion/entorno.ts, negocio.ts y roles.ts.
// Lo usan:      el controlador de autenticación y el intermediario autenticacion.ts.
//
// El token lleva solo tres datos: userId, email y role (más la hora de emisión,
// que agrega la librería). NO lleva la sucursal
// activa: esa se resuelve en la base de datos en cada petición (ver
// intermediarios/alcanceSucursal.ts), para que quitarle una sucursal a un
// usuario surta efecto de inmediato y no cuando venza el token.
// =============================================================================
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../configuracion/entorno';
import { JWT_EXPIRES_IN } from '../configuracion/negocio';
import { ROLES } from '../configuracion/roles';

// Forma exacta de lo que el sistema guarda dentro del token.
const payloadSchema = z.object({
  userId: z.string().uuid(),
  email: z.string(),
  role: z.enum(ROLES),
});

export type AuthPayload = z.infer<typeof payloadSchema>;

// Lo que se lee al verificar un token: lo anterior más la hora en que se emitió
// (iat, en segundos). jsonwebtoken la agrega sola al firmar.
const verifiedSchema = payloadSchema.extend({ iat: z.number() });
export type VerifiedToken = z.infer<typeof verifiedSchema>;

// Crea un token firmado que vence según JWT_EXPIRES_IN.
// Recibe: los tres datos de identidad. Devuelve: el token en texto.
export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN });
}

// Verifica un token.
// Recibe: el token en texto.
// Devuelve: los datos de identidad que contiene.
// Lanza error: si la firma no coincide, el token venció, usa otro algoritmo
// (incluido "none", un ataque clásico) o no tiene la forma esperada.
export function verifyToken(token: string): VerifiedToken {
  // `algorithms` obliga a aceptar SOLO HS256: sin eso, una librería podría
  // aceptar un token que el atacante firmó con otro algoritmo.
  const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  return verifiedSchema.parse(decoded);
}
