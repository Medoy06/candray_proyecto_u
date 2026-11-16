// =============================================================================
// usePanel.ts
// Qué hace:     carga el panel de indicadores y lo recarga con reload().
// Depende de:   ganchos/useCarga.ts y servicios/panel.ts.
// Lo usa:       paginas/panel/PaginaPanel.tsx.
// =============================================================================
import { getPanel } from '../servicios/panel';
import { useCarga } from './useCarga';

export function usePanel() {
  return useCarga(getPanel, [], 'No se pudo cargar el panel de indicadores.');
}
