// =============================================================================
// pacientes.ts (controlador)
// Qué hace:     recibe las peticiones de pacientes, llama al servicio y arma la
//               respuesta HTTP.
// Depende de:   servicios/pacientes.ts y esquemas/pacientes.ts.
// Lo usa:       rutas/pacientes.ts.
//
// Sin reglas de negocio ni SQL: solo traduce HTTP <-> servicio.
// =============================================================================
import type { Request, Response } from 'express';
import type { SearchPatientsQuery } from '../esquemas/pacientes';
import { createPatient, getPatient, search, updatePatient } from '../servicios/pacientes';

// GET /api/pacientes?q=&include_inactive=&page=&page_size=
export async function searchPatientsHandler(_req: Request, res: Response): Promise<void> {
  // validateQuery dejó los filtros ya limpios (y con valores por defecto).
  const query = res.locals.query as SearchPatientsQuery;
  const { rows, total } = await search(query);
  res.json({
    success: true,
    data: rows,
    pagination: {
      page: query.page,
      page_size: query.page_size,
      total,
      total_pages: Math.ceil(total / query.page_size),
    },
  });
}

// GET /api/pacientes/:id
export async function getPatientById(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getPatient(String(req.params.id)) });
}

// POST /api/pacientes
export async function createPatientHandler(req: Request, res: Response): Promise<void> {
  const patient = await createPatient(req.body, req.user!.userId, req.branchScope!.activeBranchId);
  res.status(201).json({ success: true, data: patient });
}

// PATCH /api/pacientes/:id
export async function updatePatientHandler(req: Request, res: Response): Promise<void> {
  const patient = await updatePatient(
    String(req.params.id),
    req.body,
    req.user!.userId,
    req.branchScope!.activeBranchId,
  );
  res.json({ success: true, data: patient });
}
