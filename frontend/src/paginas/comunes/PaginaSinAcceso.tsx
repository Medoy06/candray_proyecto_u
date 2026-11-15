// =============================================================================
// PaginaSinAcceso.tsx
// Qué hace:     el aviso que se muestra cuando alguien abre una pantalla para la
//               que su rol no tiene permiso.
// Lo usa:       componentes/estructura/RutaProtegida.tsx.
// =============================================================================
import { Link } from 'react-router-dom';
import { EncabezadoPagina } from '../../componentes/ui/EncabezadoPagina';

export function PaginaSinAcceso() {
  return (
    <div>
      <EncabezadoPagina title="Sin acceso" description="Su rol no tiene permiso para ver esta sección." />
      <Link to="/" className="text-sm font-medium text-marca underline underline-offset-2 hover:text-marca-oscuro">
        Volver al inicio
      </Link>
    </div>
  );
}
