// =============================================================================
// autenticacion.ts (rutas)
// Qué hace:     declara las URL de autenticación y qué intermediarios pasan
//               antes de llegar al controlador.
// Depende de:   controladores/autenticacion.ts, esquemas/autenticacion.ts y los
//               intermediarios.
// Lo usa:       app.ts, montado en /api/auth.
//
// Las rutas solo conectan: URL -> permisos -> validación -> controlador.
// Orden en cada ruta: primero quién eres (authenticate), luego dónde trabajas
// (resolveBranchScope), luego qué puedes hacer (can), luego la forma de los
// datos (validate).
// =============================================================================
import { Router } from 'express';
import { getMe, login } from '../controladores/autenticacion';
import { LoginSchema } from '../esquemas/autenticacion';
import { resolveBranchScope } from '../intermediarios/alcanceSucursal';
import { authenticate } from '../intermediarios/autenticacion';
import { validate } from '../intermediarios/validacion';

const router = Router();

// POST /api/auth/login — pública (todavía no hay sesión).
router.post('/login', validate(LoginSchema), login);

// GET /api/auth/me — datos de la sesión actual.
router.get('/me', authenticate, resolveBranchScope, getMe);

export default router;
