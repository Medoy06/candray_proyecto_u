// =============================================================================
// FormularioPaciente.tsx
// Qué hace:     la ventana para registrar un paciente o editar uno existente.
//               Es la misma ventana: al editar solo se envía lo que cambió.
// Depende de:   componentes/ui, servicios/pacientes.ts y
//               paginas/pacientes/formularioPaciente.ts (validación y cuerpos).
// Lo usa:       paginas/pacientes/PaginaPacientes.tsx.
//
// Datos mínimos a propósito: nombre, nacimiento y teléfono son obligatorios;
// DUI y correo son opcionales (no todos los pacientes los tienen).
// =============================================================================
import { useState, type FormEvent } from 'react';
import { Boton } from '../../componentes/ui/Boton';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { createPatient, updatePatient, type Patient } from '../../servicios/pacientes';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { todayText } from '../../utilidades/fechaLocal';
import {
  buildCreateInput,
  buildPatientChanges,
  EMPTY_PATIENT_FORM,
  formFromPatient,
  MIN_BIRTH_DATE,
  NAME_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  validatePatientForm,
  type PatientFormValues,
} from './formularioPaciente';

interface FormularioPacienteProps {
  patient?: Patient; // si viene, se edita; si no, se registra uno nuevo
  onClose: () => void;
  onSaved: (patient: Patient) => void;
}

export function FormularioPaciente({ patient, onClose, onSaved }: FormularioPacienteProps) {
  const mode = patient === undefined ? 'create' : 'edit';
  const [values, setValues] = useState<PatientFormValues>(patient === undefined ? EMPTY_PATIENT_FORM : formFromPatient(patient));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Cambia un solo campo sin tocar los demás.
  const set = <K extends keyof PatientFormValues>(key: K, value: PatientFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validatePatientForm(values);
    if (problem !== '') {
      setError(problem);
      return;
    }
    // Qué se pide al servidor: registrar, o editar con SOLO lo que cambió.
    let request: () => Promise<Patient>;
    if (patient === undefined) {
      request = () => createPatient(buildCreateInput(values));
    } else {
      const changes = buildPatientChanges(patient, values);
      if (Object.keys(changes).length === 0) {
        setError('No hay cambios que guardar.');
        return;
      }
      request = () => updatePatient(patient.id, changes);
    }
    setSaving(true);
    setError('');
    try {
      onSaved(await request());
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, 'No se pudo guardar el paciente.'));
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={mode === 'create' ? 'Nuevo paciente' : 'Editar paciente'}
      onClose={onClose}
      closeOnBackdrop={false}
      error={error}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton variant="primario" type="submit" form="formulario-paciente" disabled={saving}>
            {saving ? 'Guardando...' : mode === 'create' ? 'Registrar paciente' : 'Guardar cambios'}
          </Boton>
        </>
      }
    >
      <form id="formulario-paciente" onSubmit={handleSubmit} noValidate autoComplete="off" className="grid gap-4 sm:grid-cols-2">
        <FormField label="Nombre completo" required className="sm:col-span-2">
          <input
            className={inputClass}
            value={values.full_name}
            onChange={(event) => set('full_name', event.target.value)}
            maxLength={NAME_MAX_LENGTH}
            data-autofocus
            required
          />
        </FormField>
        <FormField label="Fecha de nacimiento" required>
          <input
            type="date"
            className={inputClass}
            value={values.birth_date}
            onChange={(event) => set('birth_date', event.target.value)}
            min={MIN_BIRTH_DATE}
            max={todayText()}
            required
          />
        </FormField>
        <FormField label="Teléfono" required>
          <input
            type="tel"
            className={inputClass}
            value={values.phone}
            onChange={(event) => set('phone', event.target.value)}
            maxLength={PHONE_MAX_LENGTH}
            required
          />
        </FormField>
        <FormField label="DUI" hint="Opcional. Formato 01234567-8.">
          <input
            className={inputClass}
            value={values.dui}
            onChange={(event) => set('dui', event.target.value)}
            maxLength={10}
          />
        </FormField>
        <FormField label="Correo electrónico" hint="Opcional.">
          <input
            type="email"
            className={inputClass}
            value={values.email}
            onChange={(event) => set('email', event.target.value)}
            maxLength={255}
          />
        </FormField>
      </form>
    </ModalShell>
  );
}
