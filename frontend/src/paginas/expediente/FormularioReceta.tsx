// =============================================================================
// FormularioReceta.tsx
// Qué hace:     la ventana para emitir una receta óptica o para reemplazar una:
//               las medidas de cada ojo, la distancia pupilar y una nota para el
//               taller. Al emitir, la receta sale de la nota de una consulta; al
//               reemplazar, las medidas parten de la receta que se corrige.
// Depende de:   componentes/ui, servicios/recetas.ts y paginas/expediente/
//               formularioReceta.ts y CamposOjo.tsx.
// Lo usa:       paginas/expediente/PaginaExpediente.tsx.
//
// Una receta no se edita ni se borra después: el aviso lo dice antes de guardar.
// Quién puede emitir y reemplazar lo decide el servidor; aquí solo se muestra
// su mensaje si la rechaza.
// =============================================================================
import { useState, type FormEvent } from 'react';
import { Boton } from '../../componentes/ui/Boton';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { PRESCRIPTION_LIMITS } from '../../configuracion/negocio';
import type { RecordEntry } from '../../servicios/expedientes';
import { issuePrescription, replacePrescription, type Prescription } from '../../servicios/recetas';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { formatDate, formatDateTime } from '../../utilidades/formatoFecha';
import { CamposOjo } from './CamposOjo';
import {
  buildPrescriptionMeasures,
  EMPTY_PRESCRIPTION_FORM,
  formFromPrescription,
  validatePrescriptionForm,
  type PrescriptionFormValues,
} from './formularioReceta';

// Qué se está haciendo: emitir la receta de una nota, o reemplazar una receta.
export type PrescriptionTarget = { kind: 'issue'; record: RecordEntry } | { kind: 'replace'; original: Prescription };

interface FormularioRecetaProps {
  patientId: string;
  target: PrescriptionTarget;
  onClose: () => void;
  onSaved: (prescription: Prescription) => void;
}

export function FormularioReceta({ patientId, target, onClose, onSaved }: FormularioRecetaProps) {
  const [values, setValues] = useState<PrescriptionFormValues>(
    target.kind === 'replace' ? formFromPrescription(target.original) : EMPTY_PRESCRIPTION_FORM,
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validatePrescriptionForm(values);
    if (problem !== '') {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    const measures = buildPrescriptionMeasures(values);
    try {
      const saved =
        target.kind === 'issue'
          ? await issuePrescription(patientId, { record_id: target.record.id, ...measures })
          : await replacePrescription(patientId, target.original.id, measures);
      onSaved(saved);
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, 'No se pudo guardar la receta.'));
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={target.kind === 'issue' ? 'Nueva receta' : 'Reemplazar receta'}
      size="2xl"
      onClose={onClose}
      closeOnBackdrop={false}
      error={error}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton variant="primario" type="submit" form="formulario-receta" disabled={saving}>
            {saving ? 'Guardando...' : target.kind === 'issue' ? 'Emitir receta' : 'Reemplazar receta'}
          </Boton>
        </>
      }
    >
      <form id="formulario-receta" onSubmit={handleSubmit} noValidate autoComplete="off" className="space-y-4">
        <p className="rounded-md border border-borde bg-apoyo px-3 py-2 text-sm text-texto">
          {target.kind === 'issue'
            ? `Receta de la consulta del ${formatDateTime(target.record.appointment_starts_at)}: ${target.record.diagnosis}`
            : `Esta receta reemplaza a la del ${formatDate(target.original.created_at)}. Las medidas parten de ella: cambie lo que haga falta.`}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <CamposOjo title="Ojo derecho (OD)" values={values.od} onChange={(od) => setValues({ ...values, od })} disabled={saving} autoFocus />
          <CamposOjo title="Ojo izquierdo (OI)" values={values.oi} onChange={(oi) => setValues({ ...values, oi })} disabled={saving} />
        </div>
        <FormField label="Distancia pupilar (mm)" hint="De 40 a 80, de medio en medio. Ej.: 62.5">
          <input
            value={values.pupillaryDistance}
            onChange={(event) => setValues({ ...values, pupillaryDistance: event.target.value })}
            inputMode="decimal"
            autoComplete="off"
            disabled={saving}
            className={inputClass}
          />
        </FormField>
        <FormField
          label="Nota para el taller"
          hint={`${values.lensNotes.length} / ${PRESCRIPTION_LIMITS.lensNotesMaxLength}`}
        >
          <textarea
            value={values.lensNotes}
            onChange={(event) => setValues({ ...values, lensNotes: event.target.value })}
            rows={3}
            maxLength={PRESCRIPTION_LIMITS.lensNotesMaxLength}
            disabled={saving}
            className={inputClass}
          />
        </FormField>
        <p className="text-xs text-texto-suave">
          Una vez emitida, la receta no se puede editar ni borrar. Si algo cambia, se emite otra que la reemplaza.
        </p>
      </form>
    </ModalShell>
  );
}
