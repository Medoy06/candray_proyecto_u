// =============================================================================
// panel.ts (controlador)
// Qué hace:     recibe la petición del panel de indicadores y arma la respuesta.
// Depende de:   servicios/panel.ts.
// Lo usa:       rutas/panel.ts.
// =============================================================================
import type { Request, Response } from 'express';
import { getPanel } from '../servicios/panel';

// GET /api/panel
export async function getPanelHandler(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getPanel(req.branchScope!.allowedBranchIds) });
}
