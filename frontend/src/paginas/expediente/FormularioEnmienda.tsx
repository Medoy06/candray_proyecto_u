// =============================================================================
// FormularioEnmienda.tsx
// Qué hace:     la ventana para enmendar una nota del expediente. Muestra la
//               nota original (que no cambia) y un formulario con su contenido
//               para corregirlo; al guardar se agrega una entrada nueva.
// Depende de:   servicios/expedientes.ts, componentes/ui y
//               paginas/expediente/formularioNota.ts y CamposNota.tsx.
// Lo usa:       paginas/expediente/PaginaExpediente.tsx.
//
// Nunca se modifica la nota original: la base de datos lo impide. La enmienda
// queda como una entrada aparte, con su autor, su sucursal y su fecha.
// =============================================================================
import { useState, type FormEvent } from 'react';
import { Boton } from '../../componentes/ui/Boton';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { amendNote, type RecordEntry } from '../../servicios/expedientes';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { formatDateTime } from '../../utilidades/formatoFecha';
import { CamposNota } from './CamposNota';
import { buildAmendInput, formFromEntry, validateNoteForm, type NoteFormValues } from './formularioNota';

interface FormularioEnmiendaProps {
  patientId: string;
  original: RecordEntry; // la nota que se corrige
  onClose: () => void;
  onSaved: (entry: RecordEntry) => void;
}

export function FormularioEnmienda({ patientId, original, onClose, onSaved }: FormularioEnmiendaProps) {
  const [values, setValues] = useState<NoteFormValues>(() => formFromEntry(original));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validateNoteForm(values, false);
    if (problem !== '') {
      setError(problem);
      return;
    }
    const input = buildAmendInput(values);
    if (
      input.diagnosis === original.diagnosis &&
      input.treatment === original.treatment &&
      input.notes === original.notes
    ) {
      setError('No hay cambios que registrar: modifique al menos un campo.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      onSaved(await amendNote(patientId, original.id, input));
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, 'No se pudo guardar la enmienda.'));
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Enmendar nota"
      size="2xl"
      onClose={onClose}
      closeOnBackdrop={false}
      error={error}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton variant="primario" type="submit" form="formulario-enmienda" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar enmienda'}
          </Boton>
        </>
      }
    >
      <p className="mb-4 rounded-md border border-borde bg-apoyo px-3 py-2 text-sm text-texto">
        Se enmienda la nota del {formatDateTime(original.created_at)} de {original.doctor_name}. La nota original no se
        modifica: la enmienda queda como una entrada nueva, a continuación de ella.
      </p>
      <form id="formulario-enmienda" onSubmit={handleSubmit} noValidate autoComplete="off" className="space-y-4">
        <CamposNota values={values} onChange={setValues} disabled={saving} />
      </form>
    </ModalShell>
  );
}
