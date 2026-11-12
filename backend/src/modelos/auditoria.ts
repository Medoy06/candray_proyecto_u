// =============================================================================
// auditoria.ts (modelo)
// Qué hace:     escribe filas en la tabla audit_log (bitácora de auditoría).
// Requerimiento: registro de accesos con la sucursal activa de cada acción
//               (sección 10 del documento de diseño).
// Depende de:   configuracion/baseDatos.ts.
// Lo usan:      utilidades/auditoria.ts (que es lo que llaman los controladores).
//
// Solo SQL: este archivo no decide cuándo auditar ni qué hacer si falla; eso lo
// resuelve utilidades/auditoria.ts. La tabla es de solo agregar (migración 01):
// aquí únicamente existe INSERT.
// =============================================================================
import { pool } from '../configuracion/baseDatos';

// Datos de una entrada de auditoría.
export interface CreateAuditInput {
  entityType: string;                       // sobre qué ocurrió, ej.: 'auth', 'user'
  action: string;                           // qué ocurrió, ej.: 'login_failed'
  entityId?: string | null;                 // id de la fila afectada, si aplica
  actorId?: string | null;                  // quién lo hizo; SIEMPRE sale del token, nunca del cuerpo
  branchId?: string | null;                 // sucursal activa en ese momento, si ya hay una
  detail?: Record<string, unknown> | null;  // contexto adicional (sin secretos ni contraseñas)
}

// Inserta una entrada en audit_log.
// Recibe: los datos de la entrada.
// Devuelve: nada. Lanza error si la base falla (utilidades/auditoria.ts lo atrapa).
export async function createAuditEntry(input: CreateAuditInput): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log (entity_type, action, entity_id, actor_id, branch_id, detail)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.entityType,
      input.action,
      input.entityId ?? null,
      input.actorId ?? null,
      input.branchId ?? null,
      input.detail ?? null,
    ],
  );
}
