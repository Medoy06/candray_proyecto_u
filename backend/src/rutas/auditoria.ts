// =============================================================================
// auditoria.ts (rutas)
// Qué hace:     declara las URL de consulta de la bitácora de auditoría.
// Depende de:   controladores/auditoria.ts, esquemas/auditoria.ts y los
//               intermediarios.
// Lo usa:       app.ts, montado en /api/auditoria.
//
// authenticate y can('audit_read') protegen todo el router (falla cerrado).
// Solo hay GET: la bitácora no se modifica desde la API.
// =============================================================================
import { Router } from 'express';
import { getAuditFilters, listAudit } from '../controladores/auditoria';
import { ListAuditQuerySchema } from '../esquemas/auditoria';
import { authenticate, can } from '../intermediarios/autenticacion';
import { validateQuery } from '../intermediarios/validacion';

const router = Router();
router.use(authenticate, can('audit_read'));

router.get('/', validateQuery(ListAuditQuerySchema), listAudit);
router.get('/filtros', getAuditFilters);

export default router;
