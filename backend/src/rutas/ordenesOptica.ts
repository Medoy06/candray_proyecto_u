// =============================================================================
// ordenesOptica.ts (rutas)
// Qué hace:     declara las URL de las órdenes de óptica.
// Depende de:   controladores/ordenesOptica.ts, esquemas/ordenesOptica.ts y los
//               intermediarios.
// Lo usa:       app.ts, montado en /api/ordenes-optica.
//
//   GET  /                 lista de órdenes de mis sucursales (optical_orders_read)
//   GET  /:orderId         una orden con su historia de estados (optical_orders_read)
//   POST /                 crear una orden desde una receta (optical_orders_manage)
//   POST /:orderId/estado  avanzar o cancelar una orden (optical_orders_manage)
//
// authenticate protege todo el router y cada ruta exige su capacidad ANTES de
// resolver la sucursal y de validar el cuerpo. No hay PUT, PATCH ni DELETE: una
// orden no se edita ni se borra; solo cambia de estado.
// =============================================================================
import { Router } from 'express';
import {
  changeStatusHandler,
  createOrderHandler,
  getOrderHandler,
  listOrdersHandler,
} from '../controladores/ordenesOptica';
import {
  ChangeOpticalOrderStatusSchema,
  CreateOpticalOrderSchema,
  ListOpticalOrdersQuerySchema,
} from '../esquemas/ordenesOptica';
import { resolveBranchScope } from '../intermediarios/alcanceSucursal';
import { authenticate, can } from '../intermediarios/autenticacion';
import { validate, validateQuery } from '../intermediarios/validacion';

const router = Router();
router.use(authenticate);

router.get('/', can('optical_orders_read'), resolveBranchScope, validateQuery(ListOpticalOrdersQuerySchema), listOrdersHandler);
router.get('/:orderId', can('optical_orders_read'), resolveBranchScope, getOrderHandler);
router.post('/', can('optical_orders_manage'), resolveBranchScope, validate(CreateOpticalOrderSchema), createOrderHandler);
router.post(
  '/:orderId/estado',
  can('optical_orders_manage'),
  resolveBranchScope,
  validate(ChangeOpticalOrderStatusSchema),
  changeStatusHandler,
);

export default router;
