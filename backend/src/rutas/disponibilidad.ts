// =============================================================================
// disponibilidad.ts (rutas)
// Qué hace:     declara la URL de consulta de disponibilidad de médicos.
// Depende de:   controladores/disponibilidad.ts, esquemas/disponibilidad.ts y
//               los intermediarios.
// Lo usa:       app.ts, montado en /api/disponibilidad.
//
// authenticate y can('availability_read') protegen todo el router (falla
// cerrado). Solo lectura.
// =============================================================================
import { Router } from 'express';
import { getAvailability } from '../controladores/disponibilidad';
import { AvailabilityQuerySchema } from '../esquemas/disponibilidad';
import { resolveBranchScope } from '../intermediarios/alcanceSucursal';
import { authenticate, can } from '../intermediarios/autenticacion';
import { validateQuery } from '../intermediarios/validacion';

const router = Router();
router.use(authenticate, can('availability_read'));

router.get('/', resolveBranchScope, validateQuery(AvailabilityQuerySchema), getAvailability);

export default router;
