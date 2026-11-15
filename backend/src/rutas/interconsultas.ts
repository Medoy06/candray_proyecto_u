// =============================================================================
// interconsultas.ts (rutas)
// Qué hace:     declara las URL de las interconsultas de un paciente.
// Depende de:   controladores/interconsultas.ts, esquemas/interconsultas.ts y
//               los intermediarios.
// Lo usa:       app.ts, montado en /api/pacientes/:patientId/interconsultas.
//
//   GET  /                         interconsultas del paciente
//   GET  /candidatos               médicos a los que se les puede dar una
//   POST /                         dar una interconsulta
//   POST /:referralId/revocar      revocarla
//
// authenticate protege todo el router y cada ruta exige referrals_manage ANTES
// de resolver la sucursal y de validar el cuerpo. Tener la capacidad no basta:
// el servicio exige además haber atendido al paciente. No hay DELETE: una
// interconsulta se revoca y queda el registro.
// =============================================================================
import { Router } from 'express';
import {
  grantReferralHandler,
  listCandidatesHandler,
  listReferralsHandler,
  revokeReferralHandler,
} from '../controladores/interconsultas';
import { GrantReferralSchema } from '../esquemas/interconsultas';
import { resolveBranchScope } from '../intermediarios/alcanceSucursal';
import { authenticate, can } from '../intermediarios/autenticacion';
import { validate } from '../intermediarios/validacion';

// mergeParams permite leer :patientId, que está en la ruta donde se monta el router.
const router = Router({ mergeParams: true });
router.use(authenticate);

router.get('/', can('referrals_manage'), resolveBranchScope, listReferralsHandler);
// "candidatos" va antes de cualquier ruta con parámetro para que no se confunda con uno.
router.get('/candidatos', can('referrals_manage'), resolveBranchScope, listCandidatesHandler);
router.post('/', can('referrals_manage'), resolveBranchScope, validate(GrantReferralSchema), grantReferralHandler);
router.post('/:referralId/revocar', can('referrals_manage'), resolveBranchScope, revokeReferralHandler);

export default router;
