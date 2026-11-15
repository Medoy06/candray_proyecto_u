// =============================================================================
// usuarios.ts (servicio)
// Qué hace:     las llamadas a la API de administración de usuarios y los tipos
//               de sus datos.
// Depende de:   servicios/clienteApi.ts y configuracion/roles.ts.
// Lo usan:      ganchos/useUsuarios.ts y paginas/usuarios/*.
// Requiere:     la capacidad users_manage.
//
// La API nunca entrega contraseñas ni contadores internos: solo lo que se ve acá.
// =============================================================================
import type { Role } from '../configuracion/roles';
import { api } from './clienteApi';

// Sucursal asignada a un usuario.
export interface AssignedBranch {
  id: string;
  code: string;
  name: string;
  is_default: boolean;
}

export interface ManagedUser {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  last_login: string | null; // fecha y hora local "AAAA-MM-DD HH:MM:SS"
  created_at: string;
  is_locked: boolean; // bloqueado por intentos fallidos de inicio de sesión
  branches: AssignedBranch[]; // la predeterminada primero
}

export interface UserFilters {
  role?: Role;
  is_active?: boolean;
  search?: string; // parte del nombre o del correo
}

export interface CreateUserInput {
  full_name: string;
  email: string;
  password: string;
  role: Role;
  branch_ids: string[];
  default_branch_id?: string;
}

export interface UpdateUserInput {
  full_name?: string;
  role?: Role;
  is_active?: boolean;
}

// GET /api/usuarios — con filtros opcionales. Solo se envían los que tienen valor.
export async function listUsers(filters: UserFilters = {}): Promise<ManagedUser[]> {
  const params: Record<string, string> = {};
  if (filters.role !== undefined) params.role = filters.role;
  if (filters.is_active !== undefined) params.is_active = String(filters.is_active);
  if (filters.search !== undefined && filters.search !== '') params.search = filters.search;
  const response = await api.get<{ data: ManagedUser[] }>('/usuarios', { params });
  return response.data.data;
}

// POST /api/usuarios — crea un usuario. Lanza error 409 si el correo ya existe.
export async function createUser(input: CreateUserInput): Promise<ManagedUser> {
  const response = await api.post<{ data: ManagedUser }>('/usuarios', input);
  return response.data.data;
}

// PATCH /api/usuarios/:id — modifica nombre, rol y/o estado (solo lo enviado).
export async function updateUser(id: string, input: UpdateUserInput): Promise<ManagedUser> {
  const response = await api.patch<{ data: ManagedUser }>(`/usuarios/${id}`, input);
  return response.data.data;
}
