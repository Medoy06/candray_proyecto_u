// =============================================================================
// sucursales.ts (rutas)
// Qué hace:     declara las URL de administración de sucursales.
// Depende de:   controladores/sucursales.ts, esquemas/sucursales.ts y los
//               intermediarios.
// Lo usa:       app.ts, montado en /api/sucursales.
//
// Igual que en usuarios: authenticate y can('branches_manage') protegen todo el
// router. No hay DELETE: las sucursales se desactivan con PATCH.
// =============================================================================
import { Router } from 'express';
import {
  createBranchHandler,
  getBranchById,
  listBranches,
  updateBranchHandler,
} from '../controladores/sucursales';
import { CreateBranchSchema, UpdateBranchSchema } from '../esquemas/sucursales';
import { authenticate, can } from '../intermediarios/autenticacion';
import { validate } from '../intermediarios/validacion';

const router = Router();
router.use(authenticate, can('branches_manage'));

router.get('/', listBranches);
router.post('/', validate(CreateBranchSchema), createBranchHandler);
router.get('/:id', getBranchById);
router.patch('/:id', validate(UpdateBranchSchema), updateBranchHandler);

export default router;
