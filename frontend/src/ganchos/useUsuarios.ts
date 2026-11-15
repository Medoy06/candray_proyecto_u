// =============================================================================
// useUsuarios.ts
// Qué hace:     gancho que carga la lista de usuarios según los filtros y la
//               recarga cuando cambian o cuando se pide con reload().
// Depende de:   servicios/usuarios.ts y utilidades/errorApi.ts.
// Lo usa:       paginas/usuarios/PaginaUsuarios.tsx.
//
// Si los filtros cambian mientras hay una consulta en camino, la respuesta vieja
// se descarta (cancelled): así una respuesta lenta nunca pisa a una más reciente.
// Mientras recarga conserva la lista anterior, para que la tabla no parpadee.
// =============================================================================
import { useEffect, useState } from 'react';
import { listUsers, type ManagedUser, type UserFilters } from '../servicios/usuarios';
import { getApiErrorMessage } from '../utilidades/errorApi';

interface UsersState {
  status: 'loading' | 'ready' | 'error';
  users: ManagedUser[];
  error: string | null;
}

export function useUsuarios(filters: UserFilters): UsersState & { reload: () => void } {
  const [state, setState] = useState<UsersState>({ status: 'loading', users: [], error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const { role, is_active: isActive, search } = filters;

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, status: 'loading', error: null }));
    listUsers({ role, is_active: isActive, search })
      .then((users) => {
        if (!cancelled) setState({ status: 'ready', users, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            users: [],
            error: getApiErrorMessage(error, 'No se pudo cargar la lista de usuarios.'),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [role, isActive, search, reloadKey]);

  return { ...state, reload: () => setReloadKey((key) => key + 1) };
}
