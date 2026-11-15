// =============================================================================
// useDisponibilidad.ts
// Qué hace:     carga la disponibilidad de un día en una sucursal y la vuelve a
//               pedir cuando cambian, o con reload() (por ejemplo, después de
//               que el servidor avisa que una hora ya fue tomada).
// Depende de:   ganchos/useCarga.ts y servicios/disponibilidad.ts.
// Lo usa:       paginas/citas/FormularioCita.tsx.
// =============================================================================
import { getAvailability } from '../servicios/disponibilidad';
import { useCarga } from './useCarga';

export function useDisponibilidad(date: string, branchId: string) {
  return useCarga(
    () => getAvailability(date, branchId),
    [date, branchId],
    'No se pudo cargar la disponibilidad de los médicos.',
  );
}
