// =============================================================================
// lecturaAuditoria.ts (modelo)
// Qué hace:     LEE la bitácora de auditoría con filtros y paginación, y lista
//               los valores que existen (para armar los filtros de la pantalla).
// Requerimiento: capacidad audit_read (sección 10 del documento de diseño).
// Depende de:   configuracion/baseDatos.ts.
// Lo usa:       controladores/auditoria.ts.
//
// Complementa a modelos/auditoria.ts, que solo ESCRIBE. La tabla es de solo
// agregar: aquí tampoco existe ningún UPDATE ni DELETE.
// =============================================================================
import { pool } from '../configuracion/baseDatos';
import type { ListAuditQuery } from '../esquemas/auditoria';

// Una fila de la bitácora, con el nombre de quien actuó y de la sucursal.
export interface AuditRow {
  id: string;
  created_at: string;
  entity_type: string;
  action: string;
  entity_id: string | null;
  actor_id: string | null;
  actor_name: string | null;   // nulo si no hubo usuario (ej.: correo inexistente)
  actor_email: string | null;
  branch_id: string | null;
  branch_name: string | null;
  detail: Record<string, unknown> | null;
}

// Condiciones comunes del listado y del conteo. Cada filtro vacío (null) se
// ignora. Los valores van siempre como parámetros ($1...), nunca pegados al SQL.
const WHERE = `
  WHERE ($1::text IS NULL OR a.entity_type = $1)
    AND ($2::text IS NULL OR a.action = $2)
    AND ($3::uuid IS NULL OR a.entity_id = $3)
    AND ($4::uuid IS NULL OR a.actor_id = $4)
    AND ($5::uuid IS NULL OR a.branch_id = $5)
    AND ($6::date IS NULL OR a.created_at >= $6::date)
    AND ($7::date IS NULL OR a.created_at < $7::date + 1)`;

// Convierte los filtros validados en la lista de parámetros de WHERE.
function filterParams(query: ListAuditQuery): unknown[] {
  return [
    query.entity_type ?? null,
    query.action ?? null,
    query.entity_id ?? null,
    query.actor_id ?? null,
    query.branch_id ?? null,
    query.from ?? null,
    query.to ?? null,
  ];
}

// Devuelve una página de la bitácora, de la más reciente a la más antigua, y el
// total de filas que cumplen los filtros (para calcular las páginas).
// El orden es fijo (nunca viene del cliente) y desempata por id para que las
// páginas no repitan ni salten filas con la misma hora.
export async function listAuditEntries(
  query: ListAuditQuery,
): Promise<{ rows: AuditRow[]; total: number }> {
  const params = filterParams(query);
  const [rows, count] = await Promise.all([
    pool.query<AuditRow>(
      `SELECT a.id, a.created_at, a.entity_type, a.action, a.entity_id,
              a.actor_id, u.full_name AS actor_name, u.email AS actor_email,
              a.branch_id, b.name AS branch_name, a.detail
         FROM audit_log a
         LEFT JOIN users u    ON u.id = a.actor_id
         LEFT JOIN branches b ON b.id = a.branch_id
         ${WHERE}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $8 OFFSET $9`,
      [...params, query.page_size, (query.page - 1) * query.page_size],
    ),
    pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_log a ${WHERE}`, params),
  ]);
  return { rows: rows.rows, total: count.rows[0].n };
}

// Tipos de entidad y acciones que existen en la bitácora (para los filtros).
export async function listAuditFacets(): Promise<{ entity_types: string[]; actions: string[] }> {
  const [types, actions] = await Promise.all([
    pool.query<{ value: string }>('SELECT DISTINCT entity_type AS value FROM audit_log ORDER BY 1'),
    pool.query<{ value: string }>('SELECT DISTINCT action AS value FROM audit_log ORDER BY 1'),
  ]);
  return {
    entity_types: types.rows.map((row) => row.value),
    actions: actions.rows.map((row) => row.value),
  };
}
