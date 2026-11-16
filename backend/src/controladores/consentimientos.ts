// =============================================================================
// consentimientos.ts (controlador)
// Qué hace:     recibe las peticiones de los consentimientos, llama al servicio
//               y arma la respuesta HTTP.
// Depende de:   servicios/consentimientos.ts.
// Lo usa:       rutas/consentimientos.ts.
//
// Sin reglas de negocio ni SQL: solo traduce HTTP <-> servicio y arma "quién
// pide" (usuario y sucursal activa) con lo que dejaron los intermediarios.
// =============================================================================
import type { Request, Response } from 'express';
import type { ConsentActor } from '../servicios/consentimientos';
import { getConsents, getConsentStatus, grantConsent, revoke } from '../servicios/consentimientos';

function actorOf(req: Request): ConsentActor {
  return { userId: req.user!.userId, branchId: req.branchScope!.activeBranchId };
}

// GET /api/pacientes/:patientId/consentimientos
export async function listConsentsHandler(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getConsents(String(req.params.patientId)) });
}

// GET /api/pacientes/:patientId/consentimientos/estado
export async function consentStatusHandler(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getConsentStatus(String(req.params.patientId)) });
}

// POST /api/pacientes/:patientId/consentimientos
export async function grantConsentHandler(req: Request, res: Response): Promise<void> {
  const consent = await grantConsent(String(req.params.patientId), req.body, actorOf(req));
  res.status(201).json({ success: true, data: consent });
}

// POST /api/pacientes/:patientId/consentimientos/:consentId/revocar
export async function revokeConsentHandler(req: Request, res: Response): Promise<void> {
  const consent = await revoke(String(req.params.patientId), String(req.params.consentId), actorOf(req));
  res.json({ success: true, data: consent });
}
