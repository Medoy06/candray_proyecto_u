// =============================================================================
// recetas.ts (rutas)
// Qué hace:     declara las URL de las recetas ópticas de un paciente.
// Depende de:   controladores/recetas.ts, esquemas/recetas.ts y los intermediarios.
// Lo usa:       app.ts, montado en /api/pacientes/:patientId/recetas.
//
//   GET  /                          recetas del paciente (prescriptions_read)
//   POST /                          emitir la receta de una consulta (prescriptions_author)
//   POST /:prescriptionId/reemplazos  reemplazar una receta por una corregida (prescriptions_author)
//
// authenticate protege todo el router y cada ruta exige su capacidad ANTES de
// resolver la sucursal y de validar el cuerpo. Tener la capacidad no basta: el
// servicio exige además la relación con el paciente (o el consentimiento, para la
// óptica). No hay PUT, PATCH ni DELETE: una receta no se edita, se reemplaza.
// =============================================================================
import { Router } from 'express';
import {
  issuePrescriptionHandler,
  listPrescriptionsHandler,
  replacePrescriptionHandler,
} from '../controladores/recetas';
import { IssuePrescriptionSchema, ReplacePrescriptionSchema } from '../esquemas/recetas';
import { resolveBranchScope } from '../intermediarios/alcanceSucursal';
import { authenticate, can } from '../intermediarios/autenticacion';
import { validate } from '../intermediarios/validacion';

// mergeParams permite leer :patientId, que está en la ruta donde se monta el router.
const router = Router({ mergeParams: true });
router.use(authenticate);

router.get('/', can('prescriptions_read'), resolveBranchScope, listPrescriptionsHandler);
router.post('/', can('prescriptions_author'), resolveBranchScope, validate(IssuePrescriptionSchema), issuePrescriptionHandler);
router.post(
  '/:prescriptionId/reemplazos',
  can('prescriptions_author'),
  resolveBranchScope,
  validate(ReplacePrescriptionSchema),
  replacePrescriptionHandler,
);

export default router;
