// =============================================================================
// horarios.ts (controlador)
// Qué hace:     recibe las peticiones de los bloques de horario, llama al
//               servicio y arma la respuesta HTTP.
// Depende de:   servicios/horarios.ts y esquemas/horarios.ts.
// Lo usa:       rutas/horarios.ts.
//
// Sin reglas de negocio ni SQL: solo traduce HTTP <-> servicio.
// =============================================================================
import type { Request, Response } from 'express';
import type { ListSchedulesQuery } from '../esquemas/horarios';
import { AppError } from '../intermediarios/errores';
import { createSchedule, getSchedule, list, removeSchedule, updateSchedule } from '../servicios/horarios';

// GET /api/horarios?doctor_id=&branch_id=   (solo sucursales a las que el usuario tiene acceso)
export async function listSchedulesHandler(req: Request, res: Response): Promise<void> {
  const filters = res.locals.query as ListSchedulesQuery;
  const { allowedBranchIds } = req.branchScope!;
  if (filters.branch_id && !allowedBranchIds.includes(filters.branch_id)) {
    throw new AppError('No tiene acceso a esa sucursal.', 403);
  }
  res.json({ success: true, data: await list(filters, allowedBranchIds) });
}

// GET /api/horarios/:id   (solo si es de una sucursal a la que el usuario tiene acceso)
export async function getScheduleById(req: Request, res: Response): Promise<void> {
  const block = await getSchedule(String(req.params.id));
  // Un bloque de una sucursal ajena se trata como si no existiera.
  if (!req.branchScope!.allowedBranchIds.includes(block.branch_id)) {
    throw new AppError('Bloque de horario no encontrado.', 404);
  }
  res.json({ success: true, data: block });
}

// POST /api/horarios
export async function createScheduleHandler(req: Request, res: Response): Promise<void> {
  const block = await createSchedule(req.body, req.user!.userId);
  res.status(201).json({ success: true, data: block });
}

// PATCH /api/horarios/:id
export async function updateScheduleHandler(req: Request, res: Response): Promise<void> {
  const block = await updateSchedule(String(req.params.id), req.body, req.user!.userId);
  res.json({ success: true, data: block });
}

// DELETE /api/horarios/:id
export async function deleteScheduleHandler(req: Request, res: Response): Promise<void> {
  await removeSchedule(String(req.params.id), req.user!.userId);
  res.json({ success: true, data: null });
}
