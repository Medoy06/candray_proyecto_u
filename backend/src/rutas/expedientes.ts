// =============================================================================
// expedientes.ts (rutas)
// Qué hace:     declara las URL del expediente clínico de un paciente.
// Depende de:   controladores/expedientes.ts, esquemas/expedientes.ts y los
//               intermediarios.
// Lo usa:       app.ts, montado en /api/pacientes/:patientId/expediente.
//
//   GET  /                          historial del paciente (de todas las sucursales)
//   GET  /impresion                 el expediente completo, para imprimir (queda en la bitácora)
//   GET  /pendientes                citas del médico con el paciente que aún no tienen nota
//   POST /                          escribir la nota de una consulta
//   POST /:recordId/enmiendas       corregir o completar una nota
//
// authenticate protege todo el router. Cada ruta exige su capacidad ANTES de
// resolver la sucursal y de validar el cuerpo (quien no tiene permiso no debe
// enterarse de cómo es el formulario). Tener la capacidad no basta para ver a
// un paciente: el servicio exige además una cita o una interconsulta
// (servicios/accesoPaciente.ts). No hay PUT, PATCH ni DELETE: lo escrito no se
// edita; se enmienda.
// =============================================================================
import { Router } from 'express';
import { amendNoteHandler, getHistoryHandler, listPendingHandler, printRecordHandler, writeNoteHandler } from '../controladores/expedientes';
import { AmendRecordSchema, CreateRecordSchema, ListRecordsQuerySchema } from '../esquemas/expedientes';
import { resolveBranchScope } from '../intermediarios/alcanceSucursal';
import { authenticate, can } from '../intermediarios/autenticacion';
import { validate, validateQuery } from '../intermediarios/validacion';

// mergeParams permite leer :patientId, que está en la ruta donde se monta el router.
const router = Router({ mergeParams: true });
router.use(authenticate);

router.get('/', can('medical_records_read'), resolveBranchScope, validateQuery(ListRecordsQuerySchema), getHistoryHandler);
// Citas del médico con el paciente que aún no tienen nota (para elegir a cuál escribirla).
router.get('/pendientes', can('medical_records_author'), resolveBranchScope, listPendingHandler);
// El expediente completo para imprimir; sacarlo del sistema queda en la bitácora.
router.get('/impresion', can('medical_records_output'), resolveBranchScope, printRecordHandler);
router.post('/', can('medical_records_author'), resolveBranchScope, validate(CreateRecordSchema), writeNoteHandler);
router.post(
  '/:recordId/enmiendas',
  can('medical_records_author'),
  resolveBranchScope,
  validate(AmendRecordSchema),
  amendNoteHandler,
);

export default router;
