// =============================================================================
// PaginaEnConstruccion.tsx
// Qué hace:     página provisional de las pantallas cuyo contenido llega en un
//               paso posterior. Toma el título y la descripción del mapa de rutas.
// Lo usa:       navegacion/RutasAplicacion.tsx (Usuarios, Sucursales y Auditoría,
//               hasta que el paso 5c las reemplace por las páginas reales).
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
