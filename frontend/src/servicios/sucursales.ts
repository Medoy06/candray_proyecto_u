// =============================================================================
// sucursales.ts (servicio)
// Qué hace:     las llamadas a la API de administración de sucursales y los tipos
//               de sus datos.
// Depende de:   servicios/clienteApi.ts.
// Lo usan:      las páginas y formularios que necesitan las sucursales
//               (el formulario de usuarios y la pantalla de sucursales).
// Requiere:     la capacidad branches_manage.
// =============================================================================
import { api } from './clienteApi';

// Una sucursal tal como la entrega GET /api/sucursales.
export interface ManagedBranch {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  opening_time: string; // "HH:MM:SS"
  closing_time: string; // "HH:MM:SS"
  theme_color: string;
  has_optical_counter: boolean;
  is_active: boolean;
  created_at: string;
  user_count: number;
}

// Lo que se envía al crear. address y phone van como null cuando se dejan vacíos.
export interface CreateBranchInput {
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  opening_time: string; // "HH:MM"
  closing_time: string; // "HH:MM"
  theme_color: string; // "#RRGGBB"
  has_optical_counter: boolean;
}

// Lo que se envía al editar: solo los campos que cambiaron. El código no se puede cambiar.
export interface UpdateBranchInput {
  name?: string;
  address?: string | null;
  phone?: string | null;
  opening_time?: string;
  closing_time?: string;
  theme_color?: string;
  has_optical_counter?: boolean;
  is_active?: boolean;
}

// GET /api/sucursales — todas, activas e inactivas.
export async function listBranches(): Promise<ManagedBranch[]> {
  const response = await api.get<{ data: ManagedBranch[] }>('/sucursales');
  return response.data.data;
}

// POST /api/sucursales — crea una sucursal. Lanza error 409 si el código ya existe.
export async function createBranch(input: CreateBranchInput): Promise<ManagedBranch> {
  const response = await api.post<{ data: ManagedBranch }>('/sucursales', input);
  return response.data.data;
}

// PATCH /api/sucursales/:id — modifica solo los campos enviados.
export async function updateBranch(id: string, input: UpdateBranchInput): Promise<ManagedBranch> {
  const response = await api.patch<{ data: ManagedBranch }>(`/sucursales/${id}`, input);
  return response.data.data;
}
