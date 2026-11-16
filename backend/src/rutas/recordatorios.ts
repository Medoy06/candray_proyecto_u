// =============================================================================
// recordatorios.ts (rutas)
// Qué hace:     declara la URL de la bandeja de recordatorios simulados.
// Depende de:   controladores/recordatorios.ts y los intermediarios.
// Lo usa:       app.ts, montado en /api/recordatorios.
//
//   GET  /    citas de hoy y mañana en la sucursal activa (reminders_read)
//
// Solo lectura. La capacidad se exige ANTES de resolver la sucursal.
// =============================================================================
import { Router } from 'express';
import { listRemindersHandler } from '../controladores/recordatorios';
import { resolveBranchScope } from '../intermediarios/alcanceSucursal';
import { authenticate, can } from '../intermediarios/autenticacion';

const router = Router();
router.use(authenticate, can('reminders_read'));

router.get('/', resolveBranchScope, listRemindersHandler);

export default router;
