// =============================================================================
// expedientes.ts (controlador)
// Qué hace:     recibe las peticiones del expediente, llama al servicio y arma
//               la respuesta HTTP.
// Depende de:   servicios/expedientes.ts y esquemas/expedientes.ts.
// Lo usa:       rutas/expedientes.ts.
//
// Sin reglas de negocio ni SQL: solo traduce HTTP <-> servicio y arma "quién
// pide" (usuario, rol y sucursal activa) con lo que dejaron los intermediarios.
// =============================================================================
import type { Request, Response } from 'express';
import type { ListRecordsQuery } from '../esquemas/expedientes';
import type { AccessActor } from '../servicios/accesoPaciente';
import { amendNote, getHistory, getPendingConsultations, getPrintout, writeNote } from '../servicios/expedientes';

// Quién hace la petición, según req.user (token) y req.branchScope (sucursal activa).
function actorOf(req: Request): AccessActor {
  return {
    userId: req.user!.userId,
    role: req.user!.role,
    branchId: req.branchScope!.activeBranchId,
  };
}

// GET /api/pacientes/:patientId/expediente
export async function getHistoryHandler(req: Request, res: Response): Promise<void> {
  const query = res.locals.query as ListRecordsQuery;
  const { rows, total, access } = await getHistory(String(req.params.patientId), query, actorOf(req));
  res.json({
    success: true,
    data: rows,
    access,
    pagination: {
      page: query.page,
      page_size: query.page_size,
      total,
      total_pages: Math.ceil(total / query.page_size),
    },
  });
}

// POST /api/pacientes/:patientId/expediente
export async function writeNoteHandler(req: Request, res: Response): Promise<void> {
  const note = await writeNote(String(req.params.patientId), req.body, actorOf(req));
  res.status(201).json({ success: true, data: note });
}

// POST /api/pacientes/:patientId/expediente/:recordId/enmiendas
export async function amendNoteHandler(req: Request, res: Response): Promise<void> {
  const amendment = await amendNote(
    String(req.params.patientId),
    String(req.params.recordId),
    req.body,
    actorOf(req),
  );
  res.status(201).json({ success: true, data: amendment });
}

// GET /api/pacientes/:patientId/expediente/pendientes
export async function listPendingHandler(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getPendingConsultations(String(req.params.patientId), actorOf(req)) });
}

// GET /api/pacientes/:patientId/expediente/impresion
export async function printRecordHandler(req: Request, res: Response): Promise<void> {
  const { rows, total, truncated } = await getPrintout(String(req.params.patientId), actorOf(req));
  res.json({ success: true, data: rows, total, truncated });
}
