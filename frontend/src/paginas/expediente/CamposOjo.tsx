// =============================================================================
// CamposOjo.tsx
// Qué hace:     los cuatro campos de UN ojo de la receta (esfera, cilindro, eje
//               y adición), agrupados con el nombre del ojo.
// Depende de:   componentes/ui/FormField.tsx y paginas/expediente/formularioReceta.ts.
// Lo usa:       FormularioReceta.tsx (una vez por ojo).
//
// No guarda nada: recibe los valores y avisa cada cambio. Los números se escriben
// como texto (así se acepta la coma y se valida antes de enviar).
// =============================================================================
import { FormField, inputClass } from '../../componentes/ui/FormField';
import type { EyeValues } from './formularioReceta';

interface CamposOjoProps {
  title: string; // "Ojo derecho (OD)"
  values: EyeValues;
  onChange: (values: EyeValues) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function CamposOjo({ title, values, onChange, disabled = false, autoFocus = false }: CamposOjoProps) {
  return (
    <fieldset className="rounded-md border border-borde p-3">
      <legend className="px-1 text-sm font-medium text-titulo">{title}</legend>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Esfera" hint="Ej.: -1.25 (0 si es plano)">
          <input
            value={values.sphere}
            onChange={(event) => onChange({ ...values, sphere: event.target.value })}
            inputMode="decimal"
            autoComplete="off"
            disabled={disabled}
            className={inputClass}
            data-autofocus={autoFocus ? true : undefined}
          />
        </FormField>
        <FormField label="Cilindro" hint="Ej.: -0.75">
          <input
            value={values.cylinder}
            onChange={(event) => onChange({ ...values, cylinder: event.target.value })}
            inputMode="decimal"
            autoComplete="off"
            disabled={disabled}
            className={inputClass}
          />
        </FormField>
        <FormField label="Eje" hint="De 1 a 180, si hay cilindro">
          <input
            value={values.axis}
            onChange={(event) => onChange({ ...values, axis: event.target.value })}
            inputMode="numeric"
            autoComplete="off"
            disabled={disabled}
            className={inputClass}
          />
        </FormField>
        <FormField label="Adición" hint="Ej.: 1.50, para cerca">
          <input
            value={values.addition}
            onChange={(event) => onChange({ ...values, addition: event.target.value })}
            inputMode="decimal"
            autoComplete="off"
            disabled={disabled}
            className={inputClass}
          />
        </FormField>
      </div>
    </fieldset>
  );
}
