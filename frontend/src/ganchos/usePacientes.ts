// =============================================================================
// usePacientes.ts
// Qué hace:     carga una página de pacientes según la búsqueda y la página
//               pedida, y la recarga cuando cambian o cuando se pide con reload().
// Depende de:   ganchos/useCarga.ts y servicios/pacientes.ts.
// Lo usa:       paginas/pacientes/PaginaPacientes.tsx.
//
// Es solo la "forma" de useCarga para pacientes: el cuidado con las respuestas
// viejas y con los datos anteriores vive en useCarga.
// =============================================================================
import { listPatients, type PatientFilters } from '../servicios/pacientes';
import { useCarga } from './useCarga';

export function usePacientes(filters: PatientFilters, page: number) {
  return useCarga(
    () => listPatients(filters, page),
    [filters.search, filters.includeInactive, page],
    'No se pudo cargar la lista de pacientes.',
  );
}
