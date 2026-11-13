// =============================================================================
// sucursales.ts (controlador)
// Qué hace:     recibe las peticiones de administración de sucursales, llama al
//               servicio y arma la respuesta HTTP.
// Depende de:   servicios/gestionSucursales.ts y modelos/gestionSucursales.ts.
// Lo usa:       rutas/sucursales.ts.
//
// Sin reglas de negocio ni SQL: solo traduce HTTP <-> servicio.
// =============================================================================
import type { Request, Response } from 'express';
import { listManagedBranches } from '../modelos/gestionSucursales';
import { createBranch, getBranch, updateBranch } from '../servicios/gestionSucursales';

// GET /api/sucursales   (todas, incluidas las inactivas)
export async function listBranches(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await listManagedBranches() });
}

// GET /api/sucursales/:id
export async function getBranchById(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getBranch(String(req.params.id)) });
}

// POST /api/sucursales
export async function createBranchHandler(req: Request, res: Response): Promise<void> {
  const branch = await createBranch(req.body, req.user!.userId);
  res.status(201).json({ success: true, data: branch });
}

// PATCH /api/sucursales/:id
export async function updateBranchHandler(req: Request, res: Response): Promise<void> {
  const branch = await updateBranch(String(req.params.id), req.body, req.user!.userId);
  res.json({ success: true, data: branch });
}
