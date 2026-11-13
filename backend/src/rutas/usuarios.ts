// =============================================================================
// usuarios.ts (rutas)
// Qué hace:     declara las URL de administración de usuarios.
// Depende de:   controladores/usuarios.ts, esquemas/usuarios.ts y los
//               intermediarios.
// Lo usa:       app.ts, montado en /api/usuarios.
//
// authenticate y can('users_manage') se aplican a TODO el router de una vez:
// así una ruta nueva que se agregue aquí queda protegida sin acordarse de
// ponerle permisos (falla cerrado). Estas rutas no usan resolveBranchScope: la
// administración de usuarios no es "de una sucursal", es global.
// =============================================================================
import { Router } from 'express';
import {
  createUserHandler,
  getUserById,
  listUsers,
  resetPasswordHandler,
  setUserBranchesHandler,
  unlockUserHandler,
  updateUserHandler,
} from '../controladores/usuarios';
import {
  CreateUserSchema,
  ListUsersQuerySchema,
  ResetPasswordSchema,
  SetUserBranchesSchema,
  UpdateUserSchema,
} from '../esquemas/usuarios';
import { authenticate, can } from '../intermediarios/autenticacion';
import { validate, validateQuery } from '../intermediarios/validacion';

const router = Router();
router.use(authenticate, can('users_manage'));

router.get('/', validateQuery(ListUsersQuerySchema), listUsers);
router.post('/', validate(CreateUserSchema), createUserHandler);
router.get('/:id', getUserById);
router.patch('/:id', validate(UpdateUserSchema), updateUserHandler);
router.put('/:id/sucursales', validate(SetUserBranchesSchema), setUserBranchesHandler);
router.post('/:id/desbloquear', unlockUserHandler);
router.put('/:id/contrasena', validate(ResetPasswordSchema), resetPasswordHandler);

export default router;
