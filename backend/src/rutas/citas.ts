// =============================================================================
// citas.ts (rutas)
// Qué hace:     declara las URL de las citas.
// Depende de:   controladores/citas.ts, esquemas/citas.ts y los intermediarios.
// Lo usa:       app.ts, montado en /api/citas.
//
// authenticate, can('appointments_read') y resolveBranchScope protegen todo el
// router (falla cerrado): consultar la agenda es para recepción y médicos, y
// siempre dentro de las sucursales del usuario. Agendar, reprogramar y cambiar
// el estado exigen además appointments_manage. No hay DELETE: las citas se
// cancelan.
// =============================================================================
import { Router } from 'express';
import {
  changeAppointmentStatusHandler,
  createAppointmentHandler,
  getAppointmentById,
  listAppointmentsHandler,
  rescheduleAppointmentHandler,
} from '../controladores/citas';
import {
  ChangeAppointmentStatusSchema,
  CreateAppointmentSchema,
  ListAppointmentsQuerySchema,
  RescheduleAppointmentSchema,
} from '../esquemas/citas';
import { resolveBranchScope } from '../intermediarios/alcanceSucursal';
import { authenticate, can } from '../intermediarios/autenticacion';
import { validate, validateQuery } from '../intermediarios/validacion';

const router = Router();
router.use(authenticate, can('appointments_read'), resolveBranchScope);

router.get('/', validateQuery(ListAppointmentsQuerySchema), listAppointmentsHandler);
router.get('/:id', getAppointmentById);
router.post('/', can('appointments_manage'), validate(CreateAppointmentSchema), createAppointmentHandler);
router.patch('/:id', can('appointments_manage'), validate(RescheduleAppointmentSchema), rescheduleAppointmentHandler);
router.patch('/:id/estado', can('appointments_manage'), validate(ChangeAppointmentStatusSchema), changeAppointmentStatusHandler);

export default router;
