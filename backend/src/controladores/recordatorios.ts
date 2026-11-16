// =============================================================================
// recordatorios.ts (controlador)
// Qué hace:     recibe la petición de la bandeja de recordatorios y arma la respuesta.
// Depende de:   servicios/recordatorios.ts.
// Lo usa:       rutas/recordatorios.ts.
// =============================================================================
import type { Request, Response } from 'express';
import { getReminders } from '../servicios/recordatorios';

// GET /api/recordatorios
export async function listRemindersHandler(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getReminders(req.branchScope!.activeBranchId) });
}
