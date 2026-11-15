// =============================================================================
// citas.ts (controlador)
// Qué hace:     recibe las peticiones de las citas, llama al servicio y arma la
//               respuesta HTTP.
// Depende de:   servicios/citas.ts y esquemas/citas.ts.
// Lo usa:       rutas/citas.ts.
//
// Sin reglas de negocio ni SQL: solo traduce HTTP <-> servicio y arma "quién
// actúa" (usuario, si es médico y sus sucursales) con lo que dejaron los
// intermediarios.
// =============================================================================
import type { Request, Response } from 'express';
import type { ListAppointmentsQuery } from '../esquemas/citas';
import {
  changeAppointmentStatus,
  createAppointment,
  getAppointment,
  rescheduleAppointment,
  search,
  type AppointmentActor,
} from '../servicios/citas';

// Quién hace la petición, según req.user (token) y req.branchScope (sucursales).
function actorOf(req: Request): AppointmentActor {
  return {
    userId: req.user!.userId,
    isDoctor: req.user!.role === 'doctor',
    allowedBranchIds: req.branchScope!.allowedBranchIds,
  };
}

// GET /api/citas?date=|from=&to=|patient_id=  (+ doctor_id, branch_id, status, page, page_size)
export async function listAppointmentsHandler(req: Request, res: Response): Promise<void> {
  // validateQuery dejó los filtros ya limpios (y con valores por defecto).
  const query = res.locals.query as ListAppointmentsQuery;
  const { rows, total } = await search(query, actorOf(req));
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

// GET /api/citas/:id
export async function getAppointmentById(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getAppointment(String(req.params.id), actorOf(req)) });
}

// POST /api/citas
export async function createAppointmentHandler(req: Request, res: Response): Promise<void> {
  const appointment = await createAppointment(req.body, actorOf(req), req.branchScope!.activeBranchId);
  res.status(201).json({ success: true, data: appointment });
}

// PATCH /api/citas/:id   (reprogramar o cambiar el motivo)
export async function rescheduleAppointmentHandler(req: Request, res: Response): Promise<void> {
  const appointment = await rescheduleAppointment(String(req.params.id), req.body, actorOf(req));
  res.json({ success: true, data: appointment });
}

// PATCH /api/citas/:id/estado   (cancelar, marcar atendida o ausencia)
export async function changeAppointmentStatusHandler(req: Request, res: Response): Promise<void> {
  const appointment = await changeAppointmentStatus(String(req.params.id), req.body, actorOf(req));
  res.json({ success: true, data: appointment });
}
