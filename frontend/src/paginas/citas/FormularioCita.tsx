// =============================================================================
// FormularioCita.tsx
// Qué hace:     la ventana para agendar una cita nueva o reprogramar una que ya
//               existe. Se elige paciente (solo al agendar), día y horario libre
//               de un médico, y un motivo opcional.
// Depende de:   componentes/ui, ganchos/useDisponibilidad.ts, servicios/citas.ts
//               y los selectores y la lógica de esta carpeta.
// Lo usa:       paginas/citas/PaginaCitas.tsx.
//
// Siempre es en la sucursal activa. Al reprogramar solo se envía lo que cambió, y
// se puede cambiar solo el motivo sin elegir horario nuevo.
// Si el servidor rechaza (por ejemplo, otra persona tomó esa hora), se muestra su
// mensaje y se vuelve a pedir la disponibilidad para que la hora aparezca ocupada.
// =============================================================================
import { useState, type FormEvent } from 'react';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { Boton } from '../../componentes/ui/Boton';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { useDisponibilidad } from '../../ganchos/useDisponibilidad';
import { createAppointment, rescheduleAppointment, type Appointment } from '../../servicios/citas';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { todayText } from '../../utilidades/fechaLocal';
import { formatDate, formatTime } from '../../utilidades/formatoFecha';
import {
  buildNewAppointment,
  buildRescheduleChanges,
  chosenSlotIsFree,
  dayOf,
  REASON_MAX_LENGTH,
  validateNewAppointment,
  type ChosenSlot,
} from './formularioCita';
import { SelectorFranja } from './SelectorFranja';
import { SelectorPaciente, type PatientChoice } from './SelectorPaciente';

interface FormularioCitaProps {
  branchId: string;
  initialDate: string;        // el día que se está viendo en la agenda
  appointment?: Appointment;  // si viene, se reprograma; si no, se agenda una nueva
  onClose: () => void;
  onSaved: (appointment: Appointment) => void;
}

export function FormularioCita({ branchId, initialDate, appointment, onClose, onSaved }: FormularioCitaProps) {
  const rescheduling = appointment !== undefined;
  const [patient, setPatient] = useState<PatientChoice | null>(null);
  const [date, setDate] = useState(rescheduling ? dayOf(appointment) : initialDate);
  const [slot, setSlot] = useState<ChosenSlot | null>(null);
  const [reason, setReason] = useState(appointment?.reason ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const { status, data: loaded, error: loadError, reload } = useDisponibilidad(date, branchId);
  // Mientras llega la del día nuevo, la del día anterior no se usa (sus horarios no sirven).
  const availability = loaded !== null && loaded.date === date ? loaded : null;
  const slotIsFree = chosenSlotIsFree(availability, slot);

  function changeDate(next: string) {
    if (next === '') return; // el campo quedó vacío mientras se escribe: se ignora
    setDate(next);
    setSlot(null); // el horario elegido era de otro día
    setError('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const values = { patientId: patient?.id ?? null, date, slot, reason };
    let request: () => Promise<Appointment>;
    if (appointment === undefined) {
      const problem = validateNewAppointment(values, slotIsFree);
      if (problem !== '') {
        setError(problem);
        return;
      }
      request = () => createAppointment(buildNewAppointment(values, branchId));
    } else {
      if (slot !== null && !slotIsFree) {
        setError('Ese horario ya no está disponible. Elija otro.');
        return;
      }
      const changes = buildRescheduleChanges(appointment, values);
      if (Object.keys(changes).length === 0) {
        setError('No hay cambios que guardar.');
        return;
      }
      request = () => rescheduleAppointment(appointment.id, changes);
    }
    setSaving(true);
    setError('');
    try {
      onSaved(await request());
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, 'No se pudo guardar la cita.'));
      setSaving(false);
      reload(); // la hora que falló puede haber sido tomada: se vuelve a mirar
    }
  }

  return (
    <ModalShell
      title={rescheduling ? 'Reprogramar cita' : 'Nueva cita'}
      onClose={onClose}
      closeOnBackdrop={false}
      size="2xl"
      error={error}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton variant="primario" type="submit" form="formulario-cita" disabled={saving}>
            {saving ? 'Guardando...' : rescheduling ? 'Guardar cambios' : 'Agendar cita'}
          </Boton>
        </>
      }
    >
      <form id="formulario-cita" onSubmit={handleSubmit} noValidate autoComplete="off" className="space-y-5">
        {appointment === undefined ? (
          <SelectorPaciente value={patient} onChange={setPatient} />
        ) : (
          <p className="text-sm text-texto">
            Cita de <strong>{appointment.patient_name}</strong> con {appointment.doctor_name}, el{' '}
            {formatDate(appointment.starts_at)} a las {formatTime(appointment.starts_at)}.
          </p>
        )}

        <FormField label="Día" required>
          <input
            type="date"
            className={inputClass}
            value={date}
            min={todayText()}
            onChange={(event) => changeDate(event.target.value)}
          />
        </FormField>

        <div>
          <p className="mb-1.5 text-sm font-medium text-titulo">
            Horario {!rescheduling && <span aria-hidden="true">*</span>}
          </p>
          {rescheduling && (
            <p className="mb-2 text-xs text-texto-suave">
              Elija un horario nuevo o deje este vacío para cambiar solo el motivo.
            </p>
          )}
          {status === 'error' && (
            <div className="space-y-2">
              <AlertaError message={loadError ?? 'No se pudo cargar la disponibilidad de los médicos.'} />
              <Boton size="sm" onClick={reload}>
                Reintentar
              </Boton>
            </div>
          )}
          {status === 'loading' && availability === null && (
            <p className="text-sm text-texto-suave">Cargando horarios...</p>
          )}
          {availability !== null && (
            <SelectorFranja availability={availability} value={slotIsFree ? slot : null} onChange={setSlot} />
          )}
        </div>

        <FormField label="Motivo de la cita" hint="Opcional.">
          <textarea
            className={inputClass}
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={REASON_MAX_LENGTH}
          />
        </FormField>
      </form>
    </ModalShell>
  );
}
