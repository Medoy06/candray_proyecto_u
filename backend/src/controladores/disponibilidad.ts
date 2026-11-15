// =============================================================================
// disponibilidad.ts (controlador)
// Qué hace:     responde la consulta de disponibilidad de médicos.
// Depende de:   servicios/disponibilidad.ts y esquemas/disponibilidad.ts.
// Lo usa:       rutas/disponibilidad.ts.
//
// Sin reglas de negocio ni SQL: solo traduce HTTP <-> servicio.
// =============================================================================
import type { Request, Response } from 'express';
import type { AvailabilityQuery } from '../esquemas/disponibilidad';
import { AppError } from '../intermediarios/errores';
import { getDayAvailability } from '../servicios/disponibilidad';

// GET /api/disponibilidad?date=AAAA-MM-DD&branch_id=&doctor_id=
// Sin branch_id se usa la sucursal activa; con branch_id solo se acepta una a la
// que el usuario tiene acceso.
export async function getAvailability(req: Request, res: Response): Promise<void> {
  const query = res.locals.query as AvailabilityQuery;
  const { activeBranchId, allowedBranchIds } = req.branchScope!;
  const branchId = query.branch_id ?? activeBranchId;
  if (!allowedBranchIds.includes(branchId)) {
    throw new AppError('No tiene acceso a esa sucursal.', 403);
  }
  res.json({ success: true, data: await getDayAvailability(query.date, branchId, query.doctor_id ?? null) });
}
