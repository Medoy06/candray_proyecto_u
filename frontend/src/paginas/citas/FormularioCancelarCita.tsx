// =============================================================================
// FormularioCancelarCita.tsx
// Qué hace:     la ventana para cancelar una cita: muestra de quién es y pide,
//               si se quiere, el motivo de la cancelación.
// Depende de:   componentes/ui y servicios/citas.ts.
// Lo usa:       paginas/citas/PaginaCitas.tsx.
//
// El motivo es opcional (en blanco se guarda como "sin motivo"). Cancelar no se
// puede deshacer: por eso el botón va en estilo de peligro y el foco inicial
// queda en el campo del motivo, no en el botón.
// =============================================================================
import { useState, type FormEvent } from 'react';
import { Boton } from '../../componentes/ui/Boton';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { changeAppointmentStatus, type Appointment } from '../../servicios/citas';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { formatDate, formatTime } from '../../utilidades/formatoFecha';

const REASON_MAX_LENGTH = 500;

interface FormularioCancelarCitaProps {
  appointment: Appointment;
  onClose: () => void;
  onCancelled: (appointment: Appointment) => void;
}

export function FormularioCancelarCita({ appointment, onClose, onCancelled }: FormularioCancelarCitaProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      // Un motivo en blanco se envía como null (sin motivo).
      const text = reason.trim();
      onCancelled(await changeAppointmentStatus(appointment.id, 'cancelled', text === '' ? null : text));
    } catch (cancelError: unknown) {
      setError(getApiErrorMessage(cancelError, 'No se pudo cancelar la cita.'));
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Cancelar cita"
      onClose={onClose}
      closeOnBackdrop={false}
      error={error}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Volver
          </Boton>
          <Boton variant="peligro" type="submit" form="formulario-cancelar-cita" disabled={saving}>
            {saving ? 'Cancelando...' : 'Cancelar cita'}
          </Boton>
        </>
      }
    >
      <form id="formulario-cancelar-cita" onSubmit={handleSubmit} noValidate autoComplete="off" className="space-y-4">
        <p className="text-sm text-texto">
          Cita de <strong>{appointment.patient_name}</strong> con {appointment.doctor_name}, el{' '}
          {formatDate(appointment.starts_at)} a las {formatTime(appointment.starts_at)}.
        </p>
        <FormField label="Motivo de la cancelación" hint="Opcional.">
          <textarea
            className={inputClass}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={REASON_MAX_LENGTH}
            data-autofocus
          />
        </FormField>
      </form>
    </ModalShell>
  );
}
