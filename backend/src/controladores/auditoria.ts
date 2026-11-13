// =============================================================================
// auditoria.ts (controlador)
// Qué hace:     responde las consultas de la bitácora de auditoría.
// Depende de:   modelos/lecturaAuditoria.ts y esquemas/auditoria.ts.
// Lo usa:       rutas/auditoria.ts.
//
// Solo lectura: no existe ninguna ruta para crear, cambiar ni borrar entradas
// desde la API (las entradas las escriben los demás módulos al actuar).
// =============================================================================
import type { Request, Response } from 'express';
import type { ListAuditQuery } from '../esquemas/auditoria';
import { listAuditEntries, listAuditFacets } from '../modelos/lecturaAuditoria';

// GET /api/auditoria?page=&page_size=&entity_type=&action=&entity_id=&actor_id=&branch_id=&from=&to=
export async function listAudit(_req: Request, res: Response): Promise<void> {
  // validateQuery dejó los filtros ya limpios (y con valores por defecto).
  const query = res.locals.query as ListAuditQuery;
  const { rows, total } = await listAuditEntries(query);
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

// GET /api/auditoria/filtros — valores disponibles para los desplegables.
export async function getAuditFilters(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await listAuditFacets() });
}
