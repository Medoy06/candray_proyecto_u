// =============================================================================
// ordenesOptica.ts (servicio)
// Qué hace:     las llamadas a la API de órdenes de óptica y los tipos de sus datos.
// Depende de:   servicios/clienteApi.ts.
// Lo usan:      ganchos/useOrdenesOptica.ts y paginas/ordenes/*.
// Requiere:     optical_orders_read para consultar; optical_orders_manage para
//               crear y avanzar órdenes (la óptica).
//
// Una orden no se edita ni se borra: solo cambia de estado, y no existen
// llamadas para otra cosa. Los montos llegan como números y las horas como
// texto ya en hora de El Salvador ("AAAA-MM-DD HH:MM:SS"). La orden NO trae las
// medidas de la receta: solo su vínculo (prescription_id).
// =============================================================================
import { api } from './clienteApi';

// Cuántas órdenes se piden por página.
export const OPTICAL_ORDER_PAGE_SIZE = 25;

export type OpticalOrderStatus = 'pending' | 'in_lab' | 'ready' | 'delivered' | 'cancelled';

export interface OpticalOrder {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_record_number: number;
  prescription_id: string;
  prescription_created_at: string;
  prescription_is_current: boolean;  // false: el médico la reemplazó después de la venta
  branch_id: string;
  branch_name: string;
  created_by: string;
  created_by_name: string;
  frame_description: string;
  lens_description: string;
  total_amount: number;
  deposit_amount: number;
  balance: number;                   // lo que falta por pagar
  notes: string | null;
  status: OpticalOrderStatus;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

// Un cambio de estado de la orden. El primero (from_status vacío) es su creación.
export interface OpticalOrderEvent {
  id: string;
  from_status: OpticalOrderStatus | null;
  to_status: OpticalOrderStatus;
  changed_by: string;
  changed_by_name: string;
  created_at: string;
}

export type OpticalOrderDetail = OpticalOrder & { events: OpticalOrderEvent[] };

export interface OpticalOrderPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface OpticalOrderPage {
  rows: OpticalOrder[];
  pagination: OpticalOrderPagination;
}

// Filtros de la lista. Un estado vacío ('') significa "todos".
export interface OpticalOrderFilters {
  branchId: string;
  status: OpticalOrderStatus | '';
}

// Lo que se envía al crear una orden. El paciente sale de la receta.
export interface CreateOpticalOrderInput {
  prescription_id: string;
  frame_description: string;
  lens_description: string;
  total_amount: number;
  deposit_amount: number;
  notes: string | null;
}

// GET /api/ordenes-optica — una página de órdenes de una sucursal, la más reciente primero.
export async function listOpticalOrders(filters: OpticalOrderFilters, page: number): Promise<OpticalOrderPage> {
  const params: Record<string, string | number> = {
    branch_id: filters.branchId,
    page,
    page_size: OPTICAL_ORDER_PAGE_SIZE,
  };
  if (filters.status !== '') params.status = filters.status;
  const response = await api.get<{ data: OpticalOrder[]; pagination: OpticalOrderPagination }>('/ordenes-optica', { params });
  return { rows: response.data.data, pagination: response.data.pagination };
}

// GET /api/ordenes-optica/:id — una orden con su historia de estados.
export async function getOpticalOrder(id: string): Promise<OpticalOrderDetail> {
  const response = await api.get<{ data: OpticalOrderDetail }>(`/ordenes-optica/${id}`);
  return response.data.data;
}

// POST /api/ordenes-optica — crea la orden (queda pendiente).
// Lanza 403 si el paciente no tiene consentimiento y 409 si la receta ya fue reemplazada.
export async function createOpticalOrder(input: CreateOpticalOrderInput): Promise<OpticalOrderDetail> {
  const response = await api.post<{ data: OpticalOrderDetail }>('/ordenes-optica', input);
  return response.data.data;
}

// POST /api/ordenes-optica/:id/estado — avanza la orden o la cancela (el motivo solo va al cancelar).
// Lanza 409 si ese paso no está permitido desde el estado actual.
export async function changeOpticalOrderStatus(
  id: string,
  status: Exclude<OpticalOrderStatus, 'pending'>,
  reason?: string,
): Promise<OpticalOrderDetail> {
  const body: { status: string; reason?: string } = { status };
  if (status === 'cancelled' && reason !== undefined) body.reason = reason;
  const response = await api.post<{ data: OpticalOrderDetail }>(`/ordenes-optica/${id}/estado`, body);
  return response.data.data;
}
