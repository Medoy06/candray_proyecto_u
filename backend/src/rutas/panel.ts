// =============================================================================
// panel.ts (rutas)
// Qué hace:     declara la URL del panel de indicadores.
// Depende de:   controladores/panel.ts y los intermediarios.
// Lo usa:       app.ts, montado en /api/panel.
//
//   GET  /    indicadores de mis sucursales (dashboard_read)
//
// Solo lectura: no hay otras rutas. La capacidad se exige ANTES de resolver
// las sucursales.
// =============================================================================
import { Router } from 'express';
import { getPanelHandler } from '../controladores/panel';
import { resolveBranchScope } from '../intermediarios/alcanceSucursal';
import { authenticate, can } from '../intermediarios/autenticacion';

const router = Router();
router.use(authenticate, can('dashboard_read'));

router.get('/', resolveBranchScope, getPanelHandler);

export default router;
