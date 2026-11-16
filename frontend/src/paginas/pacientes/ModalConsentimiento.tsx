// =============================================================================
// ModalConsentimiento.tsx
// Qué hace:     la ventana del consentimiento de un paciente: dice si hoy hay
//               uno vigente (quién lo registró, cuándo y cómo), deja registrar
//               uno nuevo con una nota opcional, ofrece revocar el vigente y
//               muestra los anteriores como historia.
// Depende de:   ganchos/useConsentimientos.ts, servicios/consentimientos.ts y
//               componentes/ui.
// Lo usa:       paginas/pacientes/PaginaPacientes.tsx.
//
// El consentimiento autoriza que la óptica vea la receta del paciente. La
// confirmación de "Revocar" NO se abre aquí dentro (un ConfirmDialog no va
// dentro de un ModalShell): esta ventana le avisa a la página con onRevoke y la
// página la cierra y pregunta.
// =============================================================================
import { useState, type FormEvent } from 'react';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { Boton } from '../../componentes/ui/Boton';
import { Etiqueta } from '../../componentes/ui/Etiqueta';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { CONSENT_NOTE_MAX_LENGTH } from '../../configuracion/negocio';
import { useConsentimientos } from '../../ganchos/useConsentimientos';
import { grantConsent, type Consent } from '../../servicios/consentimientos';
import type { Patient } from '../../servicios/pacientes';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { formatDateTime } from '../../utilidades/formatoFecha';

interface ModalConsentimientoProps {
  patient: Patient;
  onClose: () => void;
  onSaved: (message: string) => void;       // se registró uno: la página cierra y avisa
  onRevoke: (consent: Consent) => void;     // se pidió revocar: la página pregunta
}

export function ModalConsentimiento({ patient, onClose, onSaved, onRevoke }: ModalConsentimientoProps) {
  const consents = useConsentimientos(patient.id);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const all = consents.data ?? [];
  const active = all.find((consent) => consent.status === 'active') ?? null;
  const past = all.filter((consent) => consent.status === 'revoked');
  const ready = consents.status === 'ready' || consents.data !== null;
  const canRegister = ready && active === null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await grantConsent(patient.id, note);
      onSaved(`Consentimiento de ${patient.full_name} registrado.`);
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, 'No se pudo registrar el consentimiento.'));
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={`Consentimiento de ${patient.full_name}`}
      onClose={onClose}
      closeOnBackdrop={false}
      error={error}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Cerrar
          </Boton>
          {canRegister && (
            <Boton variant="primario" type="submit" form="formulario-consentimiento" disabled={saving}>
              {saving ? 'Guardando...' : 'Registrar consentimiento'}
            </Boton>
          )}
        </>
      }
    >
      <p className="mb-4 text-sm text-texto-suave">
        Con el consentimiento, la óptica puede ver la receta de este paciente. Sin él, no. Vale para toda la clínica y dura
        hasta que se revoque.
      </p>

      {consents.status === 'loading' && consents.data === null && <p className="text-sm text-texto-suave">Cargando...</p>}
      {consents.status === 'error' && consents.data === null && (
        <AlertaError message={consents.error ?? 'No se pudo cargar el consentimiento.'} />
      )}

      {ready && active !== null && (
        <section aria-label="Consentimiento vigente" className="rounded-md border border-borde bg-apoyo p-3">
          <div className="mb-1 flex items-center justify-between gap-3">
            <Etiqueta tone="exito">Vigente</Etiqueta>
            <Boton size="sm" variant="peligro" onClick={() => onRevoke(active)}>
              Revocar
            </Boton>
          </div>
          <p className="text-sm text-texto">
            Registrado por {active.granted_by_name} el {formatDateTime(active.created_at)}.
          </p>
          {active.note !== null && <p className="mt-1 text-sm text-texto-suave">{active.note}</p>}
        </section>
      )}

      {canRegister && (
        <form id="formulario-consentimiento" onSubmit={handleSubmit} noValidate autoComplete="off" className="space-y-3">
          <div>
            <Etiqueta tone="neutro">Sin consentimiento</Etiqueta>
          </div>
          <FormField
            label="Cómo se obtuvo (opcional)"
            hint={`${note.length} / ${CONSENT_NOTE_MAX_LENGTH}`}
          >
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={CONSENT_NOTE_MAX_LENGTH}
              disabled={saving}
              placeholder="Por ejemplo: firmó el formulario en recepción"
              className={inputClass}
              data-autofocus
            />
          </FormField>
        </form>
      )}

      {ready && past.length > 0 && (
        <section aria-label="Consentimientos anteriores" className="mt-5">
          <h3 className="mb-2 text-sm font-medium text-titulo">Anteriores</h3>
          <ul className="space-y-2">
            {past.map((consent) => (
              <li key={consent.id} className="rounded-md border border-borde px-3 py-2 text-sm text-texto">
                <Etiqueta tone="aviso">Revocado</Etiqueta>
                <p className="mt-1">
                  Registrado por {consent.granted_by_name} el {formatDateTime(consent.created_at)}.
                </p>
                <p className="text-texto-suave">
                  Revocado por {consent.revoked_by_name} el {consent.revoked_at !== null ? formatDateTime(consent.revoked_at) : ''}.
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </ModalShell>
  );
}
