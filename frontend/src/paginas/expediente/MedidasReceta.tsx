// =============================================================================
// MedidasReceta.tsx
// Qué hace:     dibuja las medidas de UNA receta: la tabla de los dos ojos
//               (esfera, cilindro, eje, adición), la distancia pupilar y la
//               nota para el taller. Un ojo sin medir no aparece.
// Depende de:   paginas/expediente/formatoReceta.ts y servicios/recetas.ts.
// Lo usan:      SeccionRecetas.tsx (en pantalla) y VistaRecetaImpresion.tsx (en papel).
//
// No decide nada: solo muestra lo que recibe.
// =============================================================================
import type { PrescriptionMeasures } from '../../servicios/recetas';
import { formatAxis, formatDiopter, formatPupillaryDistance } from './formatoReceta';

// Una fila de la tabla (un ojo), o nada si ese ojo no se midió.
function FilaOjo({ title, sphere, cylinder, axis, addition }: {
  title: string;
  sphere: number | null;
  cylinder: number | null;
  axis: number | null;
  addition: number | null;
}) {
  if (sphere === null) return null;
  return (
    <tr className="border-t border-borde">
      <th scope="row" className="py-1.5 pr-3 text-left text-sm font-medium text-titulo">{title}</th>
      <td className="px-3 py-1.5 text-sm tabular-nums text-texto">{formatDiopter(sphere)}</td>
      <td className="px-3 py-1.5 text-sm tabular-nums text-texto">{formatDiopter(cylinder)}</td>
      <td className="px-3 py-1.5 text-sm tabular-nums text-texto">{formatAxis(axis)}</td>
      <td className="px-3 py-1.5 text-sm tabular-nums text-texto">{formatDiopter(addition)}</td>
    </tr>
  );
}

export function MedidasReceta({ measures }: { measures: PrescriptionMeasures }) {
  return (
    <div>
      <table aria-label="Medidas de la receta" className="w-full max-w-md">
        <thead>
          <tr>
            <th scope="col" className="py-1 pr-3 text-left text-xs font-medium uppercase tracking-wide text-texto-suave">
              Ojo
            </th>
            {['Esfera', 'Cilindro', 'Eje', 'Adición'].map((title) => (
              <th key={title} scope="col" className="px-3 py-1 text-left text-xs font-medium uppercase tracking-wide text-texto-suave">
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <FilaOjo
            title="Derecho (OD)"
            sphere={measures.od_sphere}
            cylinder={measures.od_cylinder}
            axis={measures.od_axis}
            addition={measures.od_addition}
          />
          <FilaOjo
            title="Izquierdo (OI)"
            sphere={measures.oi_sphere}
            cylinder={measures.oi_cylinder}
            axis={measures.oi_axis}
            addition={measures.oi_addition}
          />
        </tbody>
      </table>
      {measures.pupillary_distance !== null && (
        <p className="mt-2 text-sm text-texto">
          Distancia pupilar: <span className="font-medium">{formatPupillaryDistance(measures.pupillary_distance)}</span>
        </p>
      )}
      {measures.lens_notes !== null && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-texto">
          <span className="font-medium">Para el taller:</span> {measures.lens_notes}
        </p>
      )}
    </div>
  );
}
