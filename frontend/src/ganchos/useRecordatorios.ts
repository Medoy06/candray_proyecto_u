// =============================================================================
// useRecordatorios.ts
// Qué hace:     carga la bandeja de recordatorios de la sucursal activa y la
//               vuelve a cargar cuando cambia la sucursal o con reload().
// Depende de:   ganchos/useCarga.ts y servicios/recordatorios.ts.
// Lo usa:       paginas/recordatorios/PaginaRecordatorios.tsx.
// =============================================================================
import { listReminders } from '../servicios/recordatorios';
import { useCarga } from './useCarga';

// branchId: la sucursal activa. El servidor la lee de la cabecera de la petición;
// aquí solo sirve para volver a pedir los datos cuando cambia.
export function useRecordatorios(branchId: string) {
  return useCarga(listReminders, [branchId], 'No se pudieron cargar los recordatorios.');
}
