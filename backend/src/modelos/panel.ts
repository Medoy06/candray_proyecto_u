// =============================================================================
// panel.ts (modelo)
// Qué hace:     el SQL del panel de indicadores: cuenta citas y órdenes de
//               óptica por sucursal. Solo devuelve NÚMEROS, nunca filas de
//               pacientes ni de citas concretas.
// Depende de:   configuracion/baseDatos.ts y las tablas de citas y órdenes.
// Lo usa:       servicios/panel.ts.
// =============================================================================
import { pool } from '../configuracion/baseDatos';

// Los números que se calculan para una sucursal (o para el total de varias).
export interface Indicators {
  appointments_today: {
    scheduled: number;
    completed: number;
    no_show: number;
    cancelled: number;
  };
  appointments_next_7_days: number;   // citas agendadas de mañana en adelante, hasta 7 días
  orders_open: {
    pending: number;
    in_lab: number;
    ready: number;
  };
  delivered_last_30_days: number;     // órdenes entregadas en los últimos 30 días
  sales_last_30_days: number;         // suma de esas órdenes, en dólares con IVA incluido
}

export interface BranchIndicators extends Indicators {
  branch_id: string;
  branch_name: string;
}

// Indicadores de cada sucursal pedida, ordenadas por nombre.
// Recibe: los ids de las sucursales y "hoy" como 'AAAA-MM-DD' (hora de El Salvador).
// Una sucursal sin citas ni órdenes aparece con todo en cero.
export async function getBranchIndicators(branchIds: string[], today: string): Promise<BranchIndicators[]> {
  const result = await pool.query<{
    branch_id: string;
    branch_name: string;
    today_scheduled: number;
    today_completed: number;
    today_no_show: number;
    today_cancelled: number;
    next_7_days: number;
    pending: number;
    in_lab: number;
    ready: number;
    delivered_30: number;
    sales_30: number;
  }>(
    `SELECT b.id AS branch_id, b.name AS branch_name,
            ap.today_scheduled, ap.today_completed, ap.today_no_show, ap.today_cancelled, ap.next_7_days,
            oo.pending, oo.in_lab, oo.ready, oo.delivered_30, oo.sales_30
       FROM branches b
       LEFT JOIN LATERAL (
         SELECT count(*) FILTER (WHERE a.status = 'scheduled' AND a.starts_at::date = $2::date)::int AS today_scheduled,
                count(*) FILTER (WHERE a.status = 'completed' AND a.starts_at::date = $2::date)::int AS today_completed,
                count(*) FILTER (WHERE a.status = 'no_show'   AND a.starts_at::date = $2::date)::int AS today_no_show,
                count(*) FILTER (WHERE a.status = 'cancelled' AND a.starts_at::date = $2::date)::int AS today_cancelled,
                count(*) FILTER (WHERE a.status = 'scheduled' AND a.starts_at::date > $2::date)::int AS next_7_days
           FROM appointments a
          WHERE a.branch_id = b.id
            AND a.starts_at::date BETWEEN $2::date AND ($2::date + 7)
       ) ap ON true
       LEFT JOIN LATERAL (
         SELECT count(*) FILTER (WHERE o.status = 'pending')::int AS pending,
                count(*) FILTER (WHERE o.status = 'in_lab')::int  AS in_lab,
                count(*) FILTER (WHERE o.status = 'ready')::int   AS ready,
                count(*) FILTER (WHERE o.status = 'delivered' AND o.updated_at::date > ($2::date - 30))::int AS delivered_30,
                COALESCE(sum(o.total_amount) FILTER (WHERE o.status = 'delivered' AND o.updated_at::date > ($2::date - 30)), 0)::float8 AS sales_30
           FROM optical_orders o
          WHERE o.branch_id = b.id
       ) oo ON true
      WHERE b.id = ANY($1::uuid[])
      ORDER BY b.name, b.id`,
    [branchIds, today],
  );

  return result.rows.map((row) => ({
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    appointments_today: {
      scheduled: row.today_scheduled,
      completed: row.today_completed,
      no_show: row.today_no_show,
      cancelled: row.today_cancelled,
    },
    appointments_next_7_days: row.next_7_days,
    orders_open: { pending: row.pending, in_lab: row.in_lab, ready: row.ready },
    delivered_last_30_days: row.delivered_30,
    sales_last_30_days: row.sales_30,
  }));
}
