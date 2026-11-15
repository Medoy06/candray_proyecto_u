// =============================================================================
// useSucursales.ts
// Qué hace:     carga la lista de sucursales (activas e inactivas) y permite
//               recargarla con reload().
// Depende de:   ganchos/useCarga.ts y servicios/sucursales.ts.
// Lo usa:       paginas/sucursales/PaginaSucursales.tsx.
// =============================================================================
import { listBranches, type ManagedBranch } from '../servicios/sucursales';
import { useCarga } from './useCarga';

export function useSucursales() {
  const { status, data, error, reload } = useCarga(listBranches, [], 'No se pudo cargar la lista de sucursales.');
  const branches: ManagedBranch[] = data ?? [];
  return { status, branches, error, reload };
}
