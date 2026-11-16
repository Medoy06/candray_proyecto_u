// =============================================================================
// consentimientos.ts (rutas)
// Qué hace:     declara las URL de los consentimientos de un paciente.
// Depende de:   controladores/consentimientos.ts, esquemas/consentimientos.ts y
//               los intermediarios.
// Lo usa:       app.ts, montado en /api/pacientes/:patientId/consentimientos.
//
//   GET  /                       historial de consentimientos (consents_manage)
//   GET  /estado                 ¿hay uno vigente? solo sí/no (consents_read)
//   POST /                       registrar uno (consents_manage)
//   POST /:consentId/revocar     revocarlo (consents_manage)
//
// authenticate protege todo el router y cada ruta exige su capacidad ANTES de
// resolver la sucursal y de validar el cuerpo. No hay DELETE: un consentimiento
// se revoca y queda el registro. "estado" va antes de las rutas con parámetro.
// =============================================================================
import { Router } from 'express';
import {
  consentStatusHandler,
  grantConsentHandler,
  listConsentsHandler,
  revokeConsentHandler,
} from '../controladores/consentimientos';
import { GrantConsentSchema } from '../esquemas/consentimientos';
import { resolveBranchScope } from '../intermediarios/alcanceSucursal';
import { authenticate, can } from '../intermediarios/autenticacion';
import { validate } from '../intermediarios/validacion';

// mergeParams permite leer :patientId, que está en la ruta donde se monta el router.
const router = Router({ mergeParams: true });
router.use(authenticate);

router.get('/', can('consents_manage'), resolveBranchScope, listConsentsHandler);
router.get('/estado', can('consents_read'), resolveBranchScope, consentStatusHandler);
router.post('/', can('consents_manage'), resolveBranchScope, validate(GrantConsentSchema), grantConsentHandler);
router.post('/:consentId/revocar', can('consents_manage'), resolveBranchScope, revokeConsentHandler);

export default router;
