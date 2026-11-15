// =============================================================================
// useBarraColapsable.ts
// Qué hace:     gancho que decide si el menú lateral va colapsado (solo iconos)
//               o expandido, y permite cambiarlo con un botón.
// Lo usa:       componentes/estructura/BarraLateral.tsx.
//
// Regla heredada de Hospital Mio (decisión D24): quien trabaja con la ventana a
// media pantalla (unos 770px) no puede perder un tercio del ancho en el menú.
// Por eso el menú:
//   - arranca colapsado si la ventana es angosta (menos de 1024px);
//   - sigue a la ventana: cada vez que esta cruza ese límite, se ajusta solo;
//   - se puede abrir o cerrar a mano con el botón, hasta que la ventana vuelva
//     a cruzar el límite (entonces manda la ventana otra vez).
// =============================================================================
import { useCallback, useEffect, useState } from 'react';

// Ventana "angosta": menos de 1024px de ancho.
const NARROW_QUERY = '(max-width: 1023px)';

export function useBarraColapsable(): { collapsed: boolean; toggle: () => void } {
  const [collapsed, setCollapsed] = useState(() => window.matchMedia(NARROW_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const onChange = (event: MediaQueryListEvent) => setCollapsed(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => setCollapsed((current) => !current), []);
  return { collapsed, toggle };
}
