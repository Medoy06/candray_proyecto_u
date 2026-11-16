// =============================================================================
// ordenesOptica.ts (modelo)
// Qué hace:     consultas SQL de las órdenes de óptica: listarlas, buscar una,
//               crearla, cambiar su estado y leer su historia de estados.
// Requerimiento: RF-07, orden de venta vinculada a su receta de origen.
// Depende de:   configuracion/baseDatos.ts y de las tablas de la migración 10.
// Lo usa:       servicios/ordenesOptica.ts.
//
// Solo SQL: quién puede hacer qué lo decide el servicio. Las funciones que
// escriben reciben la conexión `tx` de una transacción para que la orden y su
// historia se guarden juntas o no se guarden.
// =============================================================================
import type { PoolClient } from 'pg';
import { pool } from '../configuracion/baseDatos';
import type { ListOpticalOrdersQuery } from '../esquemas/ordenesOptica';

export type OpticalOrderStatus = 'pending' | 'in_lab' | 'ready' | 'delivered' | 'cancelled';

export interface OpticalOrder {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_record_number: number;
  prescription_id: string;
  prescription_created_at: string;
  prescription_is_current: boolean;   // false si el médico la reemplazó después de la venta
  branch_id: string;
  branch_name: string;
  created_by: string;
  created_by_name: string;
  frame_description: string;
  lens_description: string;
  total_amount: number;
  deposit_amount: number;
  balance: number;                    // lo que falta por pagar: total - anticipo
  notes: string | null;
  status: OpticalOrderStatus;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpticalOrderEvent {
  id: string;
  from_status: OpticalOrderStatus | null;  // vacío en la creación
  to_status: OpticalOrderStatus;
  changed_by: string;
  changed_by_name: string;
  created_at: string;
}

// El dinero se lee como número (no como texto) para que llegue así al cliente.
const ORDER_SELECT = `
  SELECT o.id, o.patient_id, pa.full_name AS patient_name, pa.record_number AS patient_record_number,
         o.prescription_id, pr.created_at AS prescription_created_at,
         NOT EXISTS (SELECT 1 FROM prescriptions n WHERE n.supersedes_id = pr.id) AS prescription_is_current,
         o.branch_id, b.name AS branch_name, o.created_by, u.full_name AS created_by_name,
         o.frame_description, o.lens_description,
         o.total_amount::float8 AS total_amount, o.deposit_amount::float8 AS deposit_amount,
         (o.total_amount - o.deposit_amount)::float8 AS balance,
         o.notes, o.status, o.cancellation_reason, o.created_at, o.updated_at
    FROM optical_orders o
    JOIN patients pa      ON pa.id = o.patient_id
    JOIN prescriptions pr ON pr.id = o.prescription_id
    JOIN branches b       ON b.id = o.branch_id
    JOIN users u          ON u.id = o.created_by`;

// Filtros de la lista: solo las sucursales permitidas, y opcionalmente un estado
// o un paciente. $1 = sucursales permitidas, $2 = estado, $3 = paciente, $4 = una sucursal.
const WHERE = `
  WHERE o.branch_id = ANY($1::uuid[])
    AND ($2::text IS NULL OR o.status::text = $2)
    AND ($3::uuid IS NULL OR o.patient_id = $3)
    AND ($4::uuid IS NULL OR o.branch_id = $4)`;

// Una página de órdenes (la más reciente primero) y el total que cumple los filtros.
export async function listOpticalOrders(
  query: ListOpticalOrdersQuery,
  allowedBranchIds: string[],
): Promise<{ rows: OpticalOrder[]; total: number }> {
  const params = [allowedBranchIds, query.status ?? null, query.patient_id ?? null, query.branch_id ?? null];
  const [rows, count] = await Promise.all([
    pool.query<OpticalOrder>(
      `${ORDER_SELECT} ${WHERE} ORDER BY o.created_at DESC, o.id DESC LIMIT $5 OFFSET $6`,
      [...params, query.page_size, (query.page - 1) * query.page_size],
    ),
    pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM optical_orders o ${WHERE}`, params),
  ]);
  return { rows: rows.rows, total: count.rows[0].n };
}

// Busca una orden por id. Devuelve null si no existe.
// Si recibe `tx`, bloquea la fila (FOR UPDATE) hasta terminar la transacción.
export async function findOpticalOrder(id: string, tx?: PoolClient): Promise<OpticalOrder | null> {
  const db = tx ?? pool;
  const result = await db.query<OpticalOrder>(
    `${ORDER_SELECT} WHERE o.id = $1 ${tx ? 'FOR UPDATE OF o' : ''}`,
    [id],
  );
  return result.rows[0] ?? null;
}

// La historia de estados de una orden, del primero al último.
export async function listOpticalOrderEvents(orderId: string): Promise<OpticalOrderEvent[]> {
  const result = await pool.query<OpticalOrderEvent>(
    `SELECT e.id, e.from_status, e.to_status, e.changed_by, u.full_name AS changed_by_name, e.created_at
       FROM optical_order_events e
       JOIN users u ON u.id = e.changed_by
      WHERE e.order_id = $1
      ORDER BY e.created_at, e.id`,
    [orderId],
  );
  return result.rows;
}

export interface NewOpticalOrder {
  patientId: string;
  prescriptionId: string;
  branchId: string;
  createdBy: string;
  frameDescription: string;
  lensDescription: string;
  totalAmount: number;
  depositAmount: number;
  notes: string | null;
}

// Crea la orden (en estado pendiente) y la primera fila de su historia.
// Devuelve el id de la orden.
export async function insertOpticalOrder(tx: PoolClient, data: NewOpticalOrder): Promise<string> {
  const result = await tx.query<{ id: string }>(
    `INSERT INTO optical_orders
       (patient_id, prescription_id, branch_id, created_by, frame_description, lens_description,
        total_amount, deposit_amount, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      data.patientId, data.prescriptionId, data.branchId, data.createdBy, data.frameDescription,
      data.lensDescription, data.totalAmount, data.depositAmount, data.notes,
    ],
  );
  const id = result.rows[0].id;
  await insertOrderEvent(tx, { orderId: id, fromStatus: null, toStatus: 'pending', changedBy: data.createdBy, branchId: data.branchId });
  return id;
}

// Cambia el estado de una orden (y el motivo, si se cancela) y lo anota en la historia.
export async function updateOpticalOrderStatus(
  tx: PoolClient,
  data: {
    orderId: string;
    fromStatus: OpticalOrderStatus;
    toStatus: OpticalOrderStatus;
    reason: string | null;
    changedBy: string;
    branchId: string;
  },
): Promise<void> {
  await tx.query(`UPDATE optical_orders SET status = $2, cancellation_reason = $3 WHERE id = $1`, [
    data.orderId, data.toStatus, data.reason,
  ]);
  await insertOrderEvent(tx, {
    orderId: data.orderId, fromStatus: data.fromStatus, toStatus: data.toStatus,
    changedBy: data.changedBy, branchId: data.branchId,
  });
}

async function insertOrderEvent(
  tx: PoolClient,
  data: { orderId: string; fromStatus: OpticalOrderStatus | null; toStatus: OpticalOrderStatus; changedBy: string; branchId: string },
): Promise<void> {
  await tx.query(
    `INSERT INTO optical_order_events (order_id, from_status, to_status, changed_by, branch_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [data.orderId, data.fromStatus, data.toStatus, data.changedBy, data.branchId],
  );
}
