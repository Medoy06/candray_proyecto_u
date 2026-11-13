// =============================================================================
// autenticacion.ts (esquema)
// Qué hace:     define la forma que debe tener lo que el cliente envía al
//               iniciar sesión.
// Depende de:   zod.
// Lo usan:      rutas/autenticacion.ts (a través de validate).
// =============================================================================
import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email('Correo electrónico inválido').max(255),
  // Límite superior: bcrypt solo usa los primeros 72 bytes, y aceptar textos
  // enormes sería una forma barata de gastar CPU del servidor.
  password: z.string().min(1, 'La contraseña es requerida').max(128),
});

export type LoginInput = z.infer<typeof LoginSchema>;
