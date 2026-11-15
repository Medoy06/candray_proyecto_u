// =============================================================================
// interconsultas.ts (controlador)
// Qué hace:     recibe las peticiones de las interconsultas, llama al servicio y
//               arma la respuesta HTTP.
// Depende de:   servicios/interconsultas.ts.
// Lo usa:       rutas/interconsultas.ts.
//
// Sin reglas de negocio ni SQL: solo traduce HTTP <-> servicio y arma "quién
// pide" (usuario, rol y sucursal activa) con lo que dejaron los intermediarios.
// =============================================================================
import type { Request, Response } from 'express';
import type { AccessActor } from '../servicios/accesoPaciente';
import { getCandidates, getReferrals, grantReferral, revoke } from '../servicios/interconsultas';

function actorOf(req: Request): AccessActor {
  return {
    userId: req.user!.userId,
    role: req.user!.role,
    branchId: req.branchScope!.activeBranchId,
  };
}

// GET /api/pacientes/:patientId/interconsultas
export async function listReferralsHandler(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getReferrals(String(req.params.patientId), actorOf(req)) });
}

// GET /api/pacientes/:patientId/interconsultas/candidatos
export async function listCandidatesHandler(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getCandidates(String(req.params.patientId), actorOf(req)) });
}

// POST /api/pacientes/:patientId/interconsultas
export async function grantReferralHandler(req: Request, res: Response): Promise<void> {
  const referral = await grantReferral(String(req.params.patientId), req.body, actorOf(req));
  res.status(201).json({ success: true, data: referral });
}

// POST /api/pacientes/:patientId/interconsultas/:referralId/revocar
export async function revokeReferralHandler(req: Request, res: Response): Promise<void> {
  const referral = await revoke(String(req.params.patientId), String(req.params.referralId), actorOf(req));
  res.json({ success: true, data: referral });
}
