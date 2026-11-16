// =============================================================================
// recetas.ts (controlador)
// Qué hace:     recibe las peticiones de las recetas ópticas, llama al servicio y
//               arma la respuesta HTTP.
// Depende de:   servicios/recetas.ts.
// Lo usa:       rutas/recetas.ts.
//
// Sin reglas de negocio ni SQL: solo traduce HTTP <-> servicio y arma "quién
// pide" (usuario, rol y sucursal activa) con lo que dejaron los intermediarios.
// =============================================================================
import type { Request, Response } from 'express';
import type { AccessActor } from '../servicios/accesoPaciente';
import { getPrescriptions, issuePrescription, replacePrescription } from '../servicios/recetas';

function actorOf(req: Request): AccessActor {
  return {
    userId: req.user!.userId,
    role: req.user!.role,
    branchId: req.branchScope!.activeBranchId,
  };
}

// GET /api/pacientes/:patientId/recetas
export async function listPrescriptionsHandler(req: Request, res: Response): Promise<void> {
  const { rows, access } = await getPrescriptions(String(req.params.patientId), actorOf(req));
  res.json({ success: true, data: rows, access });
}

// POST /api/pacientes/:patientId/recetas
export async function issuePrescriptionHandler(req: Request, res: Response): Promise<void> {
  const prescription = await issuePrescription(String(req.params.patientId), req.body, actorOf(req));
  res.status(201).json({ success: true, data: prescription });
}

// POST /api/pacientes/:patientId/recetas/:prescriptionId/reemplazos
export async function replacePrescriptionHandler(req: Request, res: Response): Promise<void> {
  const prescription = await replacePrescription(
    String(req.params.patientId),
    String(req.params.prescriptionId),
    req.body,
    actorOf(req),
  );
  res.status(201).json({ success: true, data: prescription });
}
