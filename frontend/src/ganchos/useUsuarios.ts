// =============================================================================
// useUsuarios.ts
// Qué hace:     carga la lista de usuarios según los filtros y la recarga cuando
//               cambian o cuando se pide con reload().
// Depende de:   ganchos/useCarga.ts y servicios/usuarios.ts.
// Lo usa:       paginas/usuarios/PaginaUsuarios.tsx.
//
// Es solo la "forma" de useCarga para usuarios: el cuidado con las respuestas
// viejas y con los datos anteriores vive en useCarga.
// =============================================================================
import { listUsers, type ManagedUser, type UserFilters } from '../servicios/usuarios';
import { useCarga } from './useCarga';

export function useUsuarios(filters: UserFilters) {
  const { role, is_active: isActive, search } = filters;
  const { status, data, error, reload } = useCarga(
    () => listUsers({ role, is_active: isActive, search }),
    [role, isActive, search],
    'No se pudo cargar la lista de usuarios.',
  );
  const users: ManagedUser[] = data ?? [];
  return { status, users, error, reload };
}
