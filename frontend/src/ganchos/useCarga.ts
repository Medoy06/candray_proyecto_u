// =============================================================================
// useCarga.ts
// Qué hace:     gancho genérico que carga datos del servidor y los recarga cuando
//               cambian sus "claves" (por ejemplo, los filtros) o cuando se pide
//               con reload().
// Depende de:   utilidades/errorApi.ts.
// Lo usan:      ganchos/useUsuarios.ts, ganchos/useSucursales.ts y las páginas
//               que no necesitan más que "cargar y mostrar".
//
// Dos cuidados que se hacen una sola vez, aquí:
//  - Si las claves cambian mientras hay una consulta en camino, la respuesta vieja
//    se descarta (cancelled): una respuesta lenta nunca pisa a una más reciente.
//  - Mientras recarga conserva los datos anteriores, para que la pantalla no
//    parpadee. Si la carga falla, los datos se quitan: no se muestra algo viejo
//    junto a un error.
// =============================================================================
import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '../utilidades/errorApi';

export interface CargaState<T> {
  status: 'loading' | 'ready' | 'error';
  data: T | null; // null = todavía no hay datos (o la carga falló)
  error: string | null;
}

// load: lo que se pide al servidor. keys: los valores de los que depende (como las
// dependencias de un useEffect). errorMessage: texto si el servidor no explica el fallo.
export function useCarga<T>(
  load: () => Promise<T>,
  keys: readonly unknown[],
  errorMessage: string,
): CargaState<T> & { reload: () => void } {
  const [state, setState] = useState<CargaState<T>>({ status: 'loading', data: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, status: 'loading', error: null }));
    load()
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', data: null, error: getApiErrorMessage(error, errorMessage) });
      });
    return () => {
      cancelled = true;
    };
    // `load` y `errorMessage` cambian en cada render; lo que decide recargar son solo las claves.
  }, [...keys, reloadKey]);

  return { ...state, reload: () => setReloadKey((key) => key + 1) };
}
