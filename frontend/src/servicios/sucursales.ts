// =============================================================================
// sucursales.ts (servicio)
// Qué hace:     las llamadas a la API de administración de sucursales y los tipos
//               de sus datos.
// Depende de:   servicios/clienteApi.ts.
// Lo usan:      las páginas y formularios que necesitan la lista de sucursales
//               (hoy: el formulario de usuarios; el paso 5c-3 agrega el resto).
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

// GET /api/sucursales — todas, activas e inactivas.
export async function listBranches(): Promise<ManagedBranch[]> {
  const response = await api.get<{ data: ManagedBranch[] }>('/sucursales');
  return response.data.data;
}
