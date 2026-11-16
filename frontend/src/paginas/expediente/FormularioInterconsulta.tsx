// =============================================================================
// FormularioInterconsulta.tsx
// Qué hace:     la ventana para darle a otro médico acceso temporal, de solo
//               lectura, al expediente de este paciente: se elige al médico, el
//               motivo y cuántos días dura.
// Depende de:   ganchos/useCarga.ts, servicios/interconsultas.ts, componentes/ui
//               y paginas/expediente/formularioInterconsulta.ts.
// Lo usa:       paginas/expediente/SeccionInterconsultas.tsx.
//
// Los médicos que se ofrecen los decide el servidor (GET .../candidatos): solo
// quienes todavía no atienden al paciente ni tienen ya una interconsulta vigente.
// =============================================================================
import { useState, type FormEvent } from 'react';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { Boton } from '../../componentes/ui/Boton';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { REFERRAL_MAX_DAYS } from '../../configuracion/negocio';
import { useCarga } from '../../ganchos/useCarga';
import { grantReferral, listReferralCandidates, type Referral } from '../../servicios/interconsultas';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import {
  buildGrantInput,
  EMPTY_REFERRAL_FORM,
  REASON_MAX_LENGTH,
  validateReferralForm,
  type ReferralFormValues,
} from './formularioInterconsulta';

interface FormularioInterconsultaProps {
  patientId: string;
  onClose: () => void;
  onSaved: (referral: Referral) => void;
}

export function FormularioInterconsulta({ patientId, onClose, onSaved }: FormularioInterconsultaProps) {
  const candidates = useCarga(() => listReferralCandidates(patientId), [patientId], 'No se pudo cargar la lista de médicos.');
  const [values, setValues] = useState<ReferralFormValues>(EMPTY_REFERRAL_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const doctors = candidates.data ?? [];
  const noDoctors = candidates.status === 'ready' && doctors.length === 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validateReferralForm(values);
    if (problem !== '') {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      onSaved(await grantReferral(patientId, buildGrantInput(values)));
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, 'No se pudo dar la interconsulta.'));
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Dar interconsulta"
      onClose={onClose}
      closeOnBackdrop={false}
      error={error}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton variant="primario" type="submit" form="formulario-interconsulta" disabled={saving || doctors.length === 0}>
            {saving ? 'Guardando...' : 'Dar interconsulta'}
          </Boton>
        </>
      }
    >
      {candidates.status === 'loading' && <p className="text-sm text-texto-suave">Cargando médicos...</p>}
      {candidates.status === 'error' && <AlertaError message={candidates.error ?? 'No se pudo cargar la lista de médicos.'} />}
      {noDoctors && (
        <p className="rounded-md border border-borde bg-apoyo px-3 py-2 text-sm text-texto">
          No hay otro médico a quien darle acceso: los demás ya atienden a este paciente o ya tienen una interconsulta vigente.
        </p>
      )}
      {doctors.length > 0 && (
        <form id="formulario-interconsulta" onSubmit={handleSubmit} noValidate autoComplete="off" className="space-y-4">
          <FormField label="Médico" required>
            <select
              value={values.providerId}
              onChange={(event) => setValues({ ...values, providerId: event.target.value })}
              className={inputClass}
              data-autofocus
              required
            >
              <option value="">Elija al médico</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.full_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Motivo" required hint={`${values.reason.length} / ${REASON_MAX_LENGTH}`}>
            <textarea
              value={values.reason}
              onChange={(event) => setValues({ ...values, reason: event.target.value })}
              rows={3}
              maxLength={REASON_MAX_LENGTH}
              disabled={saving}
              className={inputClass}
              required
            />
          </FormField>
          <FormField label="Duración (días)" required hint={`De 1 a ${REFERRAL_MAX_DAYS} días. Pasado ese tiempo el acceso termina solo.`}>
            <input
              type="number"
              min={1}
              max={REFERRAL_MAX_DAYS}
              step={1}
              value={values.days}
              onChange={(event) => setValues({ ...values, days: event.target.value })}
              disabled={saving}
              className={inputClass}
              required
            />
          </FormField>
          <p className="text-xs text-texto-suave">
            El médico podrá leer el expediente, no escribir en él. Usted puede revocar el acceso cuando quiera.
          </p>
        </form>
      )}
    </ModalShell>
  );
}
