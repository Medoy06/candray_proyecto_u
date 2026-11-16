// =============================================================================
// SelectorRecetaOrden.tsx
// Qué hace:     muestra las recetas VIGENTES de un paciente para elegir de cuál
//               sale la orden. Si hay una sola, queda elegida.
// Depende de:   componentes/ui, ganchos/useCarga.ts, servicios/recetas.ts y
//               paginas/expediente/MedidasReceta.tsx.
// Lo usa:       paginas/ordenes/FormularioOrden.tsx.
//
// Pedir las recetas exige el consentimiento del paciente: sin él el servidor
// responde 403 y aquí se muestra su mensaje. Es "tonto" respecto de la elección:
// el valor elegido vive en el formulario y aquí solo se avisa con onChange.
// =============================================================================
import { useEffect } from 'react';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { useCarga } from '../../ganchos/useCarga';
import { listOpticalPrescriptions } from '../../servicios/recetas';
import { formatDateTime } from '../../utilidades/formatoFecha';
import { MedidasReceta } from '../expediente/MedidasReceta';

interface SelectorRecetaOrdenProps {
  patientId: string;
  value: string;                       // id de la receta elegida ('' = ninguna)
  onChange: (prescriptionId: string) => void;
}

export function SelectorRecetaOrden({ patientId, value, onChange }: SelectorRecetaOrdenProps) {
  const { status, data, error } = useCarga(() => listOpticalPrescriptions(patientId), [patientId], 'No se pudieron cargar las recetas.');
  // Solo las vigentes: una receta reemplazada no se vende (el servidor también lo impide).
  const rows = data?.rows.filter((prescription) => prescription.is_current) ?? [];
  const onlyId = rows.length === 1 ? rows[0].id : '';

  // Con una sola receta, queda elegida sin que la persona tenga que marcarla.
  useEffect(() => {
    if (onlyId !== '' && value !== onlyId) onChange(onlyId);
  }, [onlyId]);

  if (status === 'loading' && data === null) return <p className="text-sm text-texto-suave">Cargando recetas...</p>;
  if (status === 'error') return <AlertaError message={error ?? 'No se pudieron cargar las recetas.'} />;
  if (rows.length === 0) {
    return (
      <p className="text-sm text-texto-suave">
        Este paciente no tiene una receta vigente. La receta la emite el médico desde la consulta.
      </p>
    );
  }

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium text-titulo">Receta</legend>
      {rows.map((prescription) => (
        <label
          key={prescription.id}
          className={`block cursor-pointer rounded-md border px-3 py-2 ${
            value === prescription.id ? 'border-titulo bg-apoyo' : 'border-borde'
          }`}
        >
          <span className="mb-1 flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="receta-de-la-orden"
              value={prescription.id}
              checked={value === prescription.id}
              onChange={() => onChange(prescription.id)}
            />
            <span className="font-medium text-titulo">Receta del {formatDateTime(prescription.created_at)}</span>
            <span className="text-texto-suave">· {prescription.doctor_name}</span>
          </span>
          <MedidasReceta measures={prescription} />
        </label>
      ))}
    </fieldset>
  );
}
