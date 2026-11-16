// =============================================================================
// FormularioNota.tsx
// Qué hace:     la ventana para escribir la nota de una consulta: se elige la
//               consulta (solo se ofrecen las del médico con este paciente que
//               ya pasaron y todavía no tienen nota) y se llenan diagnóstico,
//               tratamiento y notas.
// Depende de:   ganchos/useCarga.ts, servicios/expedientes.ts, componentes/ui y
//               paginas/expediente/formularioNota.ts y CamposNota.tsx.
// Lo usa:       paginas/expediente/PaginaExpediente.tsx.
//
// Qué consultas se ofrecen lo decide el servidor (GET .../pendientes), con las
// mismas reglas que al guardar; así la lista nunca ofrece una cita en la que
// el servidor luego diría que no. Una nota no se edita ni se borra después:
// el aviso lo dice antes de guardar.
// =============================================================================
import { useEffect, useState, type FormEvent } from 'react';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { Boton } from '../../componentes/ui/Boton';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { useCarga } from '../../ganchos/useCarga';
import { createNote, listPendingConsultations, type PendingConsultation, type RecordEntry } from '../../servicios/expedientes';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { formatDateTime } from '../../utilidades/formatoFecha';
import { CamposNota } from './CamposNota';
import { buildCreateInput, EMPTY_NOTE_FORM, validateNoteForm, type NoteFormValues } from './formularioNota';

interface FormularioNotaProps {
  patientId: string;
  onClose: () => void;
  onSaved: (entry: RecordEntry) => void;
}

// Cómo se muestra una consulta en la lista desplegable.
function consultationLabel(consultation: PendingConsultation): string {
  const reason = consultation.reason === null ? '' : ` · ${consultation.reason}`;
  return `${formatDateTime(consultation.starts_at)} · ${consultation.branch_name}${reason}`;
}

export function FormularioNota({ patientId, onClose, onSaved }: FormularioNotaProps) {
  const pending = useCarga(() => listPendingConsultations(patientId), [patientId], 'No se pudieron cargar las consultas.');
  const [values, setValues] = useState<NoteFormValues>(EMPTY_NOTE_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Con una sola consulta posible, ya viene elegida.
  useEffect(() => {
    if (pending.data !== null && pending.data.length === 1) {
      setValues((current) => ({ ...current, appointmentId: pending.data![0].id }));
    }
  }, [pending.data]);

  const consultations = pending.data ?? [];
  const noConsultations = pending.status === 'ready' && consultations.length === 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validateNoteForm(values, true);
    if (problem !== '') {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      onSaved(await createNote(patientId, buildCreateInput(values)));
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, 'No se pudo guardar la nota.'));
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Nueva nota de consulta"
      size="2xl"
      onClose={onClose}
      closeOnBackdrop={false}
      error={error}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton variant="primario" type="submit" form="formulario-nota" disabled={saving || consultations.length === 0}>
            {saving ? 'Guardando...' : 'Guardar nota'}
          </Boton>
        </>
      }
    >
      {pending.status === 'loading' && <p className="text-sm text-texto-suave">Cargando consultas...</p>}
      {pending.status === 'error' && <AlertaError message={pending.error ?? 'No se pudieron cargar las consultas.'} />}
      {noConsultations && (
        <p className="rounded-md border border-borde bg-apoyo px-3 py-2 text-sm text-texto">
          No tiene consultas pendientes de nota con este paciente. Una nota se escribe sobre una cita de hoy o de una
          fecha anterior que no haya sido cancelada y que todavía no tenga nota.
        </p>
      )}
      {consultations.length > 0 && (
        <form id="formulario-nota" onSubmit={handleSubmit} noValidate autoComplete="off" className="space-y-4">
          <FormField label="Consulta" required>
            <select
              value={values.appointmentId}
              onChange={(event) => setValues({ ...values, appointmentId: event.target.value })}
              className={inputClass}
              data-autofocus
              required
            >
              <option value="">Elija la consulta</option>
              {consultations.map((consultation) => (
                <option key={consultation.id} value={consultation.id}>
                  {consultationLabel(consultation)}
                </option>
              ))}
            </select>
          </FormField>
          <CamposNota values={values} onChange={setValues} disabled={saving} />
          <p className="text-xs text-texto-suave">
            Una vez guardada, la nota no se puede editar ni borrar. Si algo cambia, se agrega una enmienda.
          </p>
        </form>
      )}
    </ModalShell>
  );
}
