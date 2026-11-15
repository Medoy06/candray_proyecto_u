// =============================================================================
// pacientes.ts (rutas)
// Qué hace:     declara las URL de pacientes.
// Depende de:   controladores/pacientes.ts, esquemas/pacientes.ts y los
//               intermediarios.
// Lo usa:       app.ts, montado en /api/pacientes.
//
// authenticate y can('patients_search') protegen todo el router (falla
// cerrado): quien no puede ni buscar pacientes no entra a ninguna ruta.
// Registrar y modificar exigen además patients_manage, y conocer la sucursal
// activa para dejarla en la auditoría. No hay DELETE: los pacientes se
// desactivan con PATCH.
// =============================================================================
import { Router } from 'express';
import {
  createPatientHandler,
  getPatientById,
  searchPatientsHandler,
  updatePatientHandler,
} from '../controladores/pacientes';
import { CreatePatientSchema, SearchPatientsQuerySchema, UpdatePatientSchema } from '../esquemas/pacientes';
import { resolveBranchScope } from '../intermediarios/alcanceSucursal';
import { authenticate, can } from '../intermediarios/autenticacion';
import { validate, validateQuery } from '../intermediarios/validacion';

const router = Router();
router.use(authenticate, can('patients_search'));

router.get('/', validateQuery(SearchPatientsQuerySchema), searchPatientsHandler);
router.get('/:id', getPatientById);
router.post('/', can('patients_manage'), resolveBranchScope, validate(CreatePatientSchema), createPatientHandler);
router.patch('/:id', can('patients_manage'), resolveBranchScope, validate(UpdatePatientSchema), updatePatientHandler);

export default router;
