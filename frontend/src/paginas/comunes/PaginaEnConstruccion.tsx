// =============================================================================
// PaginaEnConstruccion.tsx
// Qué hace:     página provisional de las pantallas cuyo contenido llega en un
//               paso posterior. Toma el título y la descripción del mapa de rutas.
// Lo usa:       nadie por ahora: con la Auditoría (paso 5c-4) todas las
//               pantallas del Incremento 0 ya son reales. Se conserva para las
//               pantallas nuevas del Incremento 1 mientras se construyen; si no
//               se usa, se elimina en la limpieza final.
// =============================================================================
import { ROUTES, type RouteId } from '../../configuracion/rutas';
import { EncabezadoPagina } from '../../componentes/ui/EncabezadoPagina';
import { Tarjeta } from '../../componentes/ui/Tarjeta';

export function PaginaEnConstruccion({ id }: { id: RouteId }) {
  const route = ROUTES.find((candidate) => candidate.id === id);
  return (
    <div>
      <EncabezadoPagina title={route?.label ?? 'Sección'} description={route?.description} />
      <Tarjeta title="En construcción">
        <p className="text-sm text-texto-suave">
          Esta pantalla se está desarrollando. El servicio de la API que la respalda ya existe.
        </p>
      </Tarjeta>
    </div>
  );
}
