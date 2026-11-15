// =============================================================================
// PaginaNoEncontrada.tsx
// Qué hace:     el aviso que se muestra cuando la dirección no corresponde a
//               ninguna pantalla (un enlace viejo o mal escrito).
// Lo usa:       navegacion/RutasAplicacion.tsx (ruta comodín "*").
// =============================================================================
import { Link } from 'react-router-dom';
import { EncabezadoPagina } from '../../componentes/ui/EncabezadoPagina';

export function PaginaNoEncontrada() {
  return (
    <div>
      <EncabezadoPagina title="Página no encontrada" description="Esa dirección no existe en el sistema." />
      <Link to="/" className="text-sm font-medium text-marca underline underline-offset-2 hover:text-marca-oscuro">
        Volver al inicio
      </Link>
    </div>
  );
}
