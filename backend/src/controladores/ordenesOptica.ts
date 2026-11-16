// =============================================================================
// ordenesOptica.ts (controlador)
// Qué hace:     recibe las peticiones de las órdenes de óptica, llama al servicio
//               y arma la respuesta HTTP.
// Depende de:   servicios/ordenesOptica.ts.
// Lo usa:       rutas/ordenesOptica.ts.
//
// Sin reglas de negocio ni SQL: solo traduce HTTP <-> servicio y arma "quién
// pide" (usuario, sucursal activa y sucursales permitidas) con lo que dejaron
// los intermediarios.
// =============================================================================
import type { Request, Response } from 'express';
import type { ListOpticalOrdersQuery } from '../esquemas/ordenesOptica';
import { changeStatus, createOrder, getOrder, search, type OrderActor } from '../servicios/ordenesOptica';

function actorOf(req: Request): OrderActor {
  return {
    userId: req.user!.userId,
    branchId: req.branchScope!.activeBranchId,
    allowedBranchIds: req.branchScope!.allowedBranchIds,
  };
}

// GET /api/ordenes-optica?status=&patient_id=&branch_id=&page=&page_size=
export async function listOrdersHandler(req: Request, res: Response): Promise<void> {
  // validateQuery dejó los filtros ya limpios (y con valores por defecto).
  const query = res.locals.query as ListOpticalOrdersQuery;
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

// GET /api/ordenes-optica/:orderId
export async function getOrderHandler(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getOrder(String(req.params.orderId), actorOf(req)) });
}

// POST /api/ordenes-optica
export async function createOrderHandler(req: Request, res: Response): Promise<void> {
  res.status(201).json({ success: true, data: await createOrder(req.body, actorOf(req)) });
}

// POST /api/ordenes-optica/:orderId/estado
export async function changeStatusHandler(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await changeStatus(String(req.params.orderId), req.body, actorOf(req)) });
}
