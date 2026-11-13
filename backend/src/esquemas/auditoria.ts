// =============================================================================
// auditoria.ts (esquema)
// Qué hace:     define los filtros y la paginación que acepta la consulta de
//               la bitácora de auditoría (vienen en la URL, como texto).
// Depende de:   zod.
// Lo usa:       rutas/auditoria.ts (a través de validateQuery).
// =============================================================================
import { z } from 'zod';

// Fecha en formato AAAA-MM-DD que además sea una fecha REAL (no 2026-02-31).
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'La fecha no existe');

export const ListAuditQuerySchema = z
  .object({
    // Paginación: página 1 en adelante, entre 1 y 100 filas por página.
    page: z.coerce.number().int().min(1).max(100000).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(25),
    // Filtros opcionales (todos se combinan con AND).
    entity_type: z.string().trim().min(1).max(50).optional(),
    action: z.string().trim().min(1).max(50).optional(),
    entity_id: z.string().uuid().optional(),
    actor_id: z.string().uuid().optional(),
    branch_id: z.string().uuid().optional(),
    from: dateSchema.optional(), // desde el inicio de ese día
    to: dateSchema.optional(),   // hasta el final de ese día (inclusive)
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'La fecha "from" no puede ser posterior a "to"',
    path: ['from'],
  });

export type ListAuditQuery = z.infer<typeof ListAuditQuerySchema>;
