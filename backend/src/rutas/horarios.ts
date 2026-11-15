// =============================================================================
// horarios.ts (rutas)
// Qué hace:     declara las URL de los bloques de horario de los médicos.
// Depende de:   controladores/horarios.ts, esquemas/horarios.ts y los
//               intermediarios.
// Lo usa:       app.ts, montado en /api/horarios.
//
// authenticate y can('availability_read') protegen todo el router (falla
// cerrado). Leer los horarios es para quien consulta la disponibilidad;
// crear, modificar y borrar exige además schedules_manage.
// =============================================================================
import { Router } from 'express';
import {
  createScheduleHandler,
  deleteScheduleHandler,
  getScheduleById,
  listSchedulesHandler,
  updateScheduleHandler,
} from '../controladores/horarios';
import { CreateScheduleSchema, ListSchedulesQuerySchema, UpdateScheduleSchema } from '../esquemas/horarios';
import { resolveBranchScope } from '../intermediarios/alcanceSucursal';
import { authenticate, can } from '../intermediarios/autenticacion';
import { validate, validateQuery } from '../intermediarios/validacion';

const router = Router();
router.use(authenticate, can('availability_read'));

router.get('/', resolveBranchScope, validateQuery(ListSchedulesQuerySchema), listSchedulesHandler);
router.get('/:id', resolveBranchScope, getScheduleById);
router.post('/', can('schedules_manage'), validate(CreateScheduleSchema), createScheduleHandler);
router.patch('/:id', can('schedules_manage'), validate(UpdateScheduleSchema), updateScheduleHandler);
router.delete('/:id', can('schedules_manage'), deleteScheduleHandler);

export default router;
