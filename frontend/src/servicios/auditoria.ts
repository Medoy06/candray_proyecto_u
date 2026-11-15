// =============================================================================
// auditoria.ts (servicio)
// Qué hace:     las llamadas a la API de la bitácora de auditoría y los tipos de
//               sus datos. Solo lectura: la bitácora no se modifica desde aquí.
// Depende de:   servicios/clienteApi.ts.
// Lo usan:      ganchos/useAuditoria.ts y paginas/auditoria/*.
// Requiere:     la capacidad audit_read.
// =============================================================================
import { api } from './clienteApi';

// Cuántas filas se piden por página (el servidor acepta de 1 a 100).
export const AUDIT_PAGE_SIZE = 25;

// Una fila de la bitácora. Las horas llegan como texto ya en hora de El Salvador.
export interface AuditEntry {
  id: string;
  created_at: string;
  entity_type: string; // sobre qué ocurrió: 'auth', 'user', 'branch'...
  action: string;      // qué ocurrió: 'login_failed', 'user_created'...
  entity_id: string | null;
  actor_id: string | null;
  actor_name: string | null;  // null si no hubo usuario (ej.: correo inexistente)
  actor_email: string | null;
  branch_id: string | null;
  branch_name: string | null;
  detail: Record<string, unknown> | null;
}

export interface AuditPagination {
  page: number;
  page_size: number;
  total: number;       // filas que cumplen los filtros, en todas las páginas
  total_pages: number;
}

// Filtros de la pantalla. Un filtro vacío ('') significa "sin filtrar".
export interface AuditFilters {
  entity_type: string;
  action: string;
  from: string; // AAAA-MM-DD
  to: string;   // AAAA-MM-DD
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = { entity_type: '', action: '', from: '', to: '' };

// Valores que existen en la bitácora, para llenar los desplegables.
export interface AuditFacets {
  entity_types: string[];
  actions: string[];
}

export interface AuditPage {
  rows: AuditEntry[];
  pagination: AuditPagination;
}

// GET /api/auditoria — una página de la bitácora (la más reciente primero).
// Solo se envían los filtros que tienen valor.
export async function listAudit(filters: AuditFilters, page: number): Promise<AuditPage> {
  const params: Record<string, string | number> = { page, page_size: AUDIT_PAGE_SIZE };
  for (const key of ['entity_type', 'action', 'from', 'to'] as const) {
    if (filters[key] !== '') params[key] = filters[key];
  }
  const response = await api.get<{ data: AuditEntry[]; pagination: AuditPagination }>('/auditoria', { params });
  return { rows: response.data.data, pagination: response.data.pagination };
}

// GET /api/auditoria/filtros — tipos de entidad y acciones que existen.
export async function getAuditFacets(): Promise<AuditFacets> {
  const response = await api.get<{ data: AuditFacets }>('/auditoria/filtros');
  return response.data.data;
}
