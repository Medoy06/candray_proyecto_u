// =============================================================================
// CamposNota.tsx
// Qué hace:     los tres campos de una nota clínica (diagnóstico, tratamiento y
//               notas), con su contador de caracteres. Los comparten el
//               formulario de "nueva nota" y el de "enmendar".
// Depende de:   componentes/ui/FormField.tsx y paginas/expediente/formularioNota.ts.
// Lo usan:      FormularioNota.tsx y FormularioEnmienda.tsx.
//
// No guarda nada: recibe los valores y avisa cada cambio, como los demás campos.
// =============================================================================
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { DIAGNOSIS_MAX_LENGTH, NOTES_MAX_LENGTH, TREATMENT_MAX_LENGTH, type NoteFormValues } from './formularioNota';

interface CamposNotaProps {
  values: NoteFormValues;
  onChange: (values: NoteFormValues) => void;
  disabled?: boolean;
}

export function CamposNota({ values, onChange, disabled = false }: CamposNotaProps) {
  return (
    <>
      <FormField label="Diagnóstico" required hint={`${values.diagnosis.length} / ${DIAGNOSIS_MAX_LENGTH}`}>
        <textarea
          value={values.diagnosis}
          onChange={(event) => onChange({ ...values, diagnosis: event.target.value })}
          required
          rows={3}
          maxLength={DIAGNOSIS_MAX_LENGTH}
          disabled={disabled}
          className={inputClass}
        />
      </FormField>
      <FormField label="Tratamiento" hint={`${values.treatment.length} / ${TREATMENT_MAX_LENGTH}`}>
        <textarea
          value={values.treatment}
          onChange={(event) => onChange({ ...values, treatment: event.target.value })}
          rows={3}
          maxLength={TREATMENT_MAX_LENGTH}
          disabled={disabled}
          className={inputClass}
        />
      </FormField>
      <FormField label="Notas" hint={`${values.notes.length} / ${NOTES_MAX_LENGTH}`}>
        <textarea
          value={values.notes}
          onChange={(event) => onChange({ ...values, notes: event.target.value })}
          rows={4}
          maxLength={NOTES_MAX_LENGTH}
          disabled={disabled}
          className={inputClass}
        />
      </FormField>
    </>
  );
}
