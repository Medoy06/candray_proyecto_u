// =============================================================================
// FormularioHorario.tsx
// Qué hace:     la ventana para crear o editar un bloque de horario de un
//               médico: día, sucursal y hora de inicio y de fin.
// Depende de:   componentes/ui, paginas/horarios/formularioHorario.ts,
//               paginas/horarios/etiquetasHorarios.ts y servicios/horarios.ts.
// Lo usa:       paginas/horarios/PaginaHorarios.tsx.
//
// Las horas se eligen de una lista de 30 en 30 minutos dentro del horario de la
// sucursal elegida; al cambiar de sucursal se vuelven a proponer apertura y
// cierre. Los cruces con otros bloques y las citas que quedarían sin cubrir los
// decide el servidor: su mensaje se muestra dentro de la ventana.
// =============================================================================
import { useState, type FormEvent } from 'react';
import { Boton } from '../../componentes/ui/Boton';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { createSchedule, updateSchedule, type ScheduleBlock } from '../../servicios/horarios';
import type { ManagedBranch } from '../../servicios/sucursales';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { WEEKDAYS, WEEKDAY_LABELS } from './etiquetasHorarios';
import {
  buildChanges, buildCreateInput, initialValues, timeOptions, validateScheduleForm, withValue,
  type ScheduleFormValues,
} from './formularioHorario';

interface FormularioHorarioProps {
  doctorId: string;
  doctorName: string;
  block: ScheduleBlock | null;     // null = bloque nuevo
  branches: ManagedBranch[];       // las sucursales entre las que se puede elegir
  onClose: () => void;
  onSaved: (block: ScheduleBlock) => void;
}

export function FormularioHorario({ doctorId, doctorName, block, branches, onClose, onSaved }: FormularioHorarioProps) {
  const first = branches[0];
  const [values, setValues] = useState<ScheduleFormValues>(() =>
    initialValues(block, first?.id ?? '', first?.opening_time ?? '', first?.closing_time ?? ''),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const branch = branches.find((item) => item.id === values.branchId);
  const options = branch === undefined ? [] : timeOptions(branch.opening_time, branch.closing_time);
  const startOptions = withValue(options.slice(0, -1), values.start);
  const endOptions = withValue(options.slice(1), values.end);

  // Cambiar de sucursal cambia las horas posibles: se proponen apertura y cierre de la nueva.
  function changeBranch(branchId: string) {
    const next = branches.find((item) => item.id === branchId);
    setValues({
      ...values,
      branchId,
      start: next?.opening_time.slice(0, 5) ?? '',
      end: next?.closing_time.slice(0, 5) ?? '',
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validateScheduleForm(values);
    if (problem !== '') {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (block === null) {
        onSaved(await createSchedule(buildCreateInput(doctorId, values)));
      } else {
        const changes = buildChanges(block, values);
        if (Object.keys(changes).length === 0) {
          setError('No hay cambios que guardar.');
          setSaving(false);
          return;
        }
        onSaved(await updateSchedule(block.id, changes));
      }
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, 'No se pudo guardar el bloque de horario.'));
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={block === null ? 'Nuevo bloque de horario' : 'Editar bloque de horario'}
      onClose={onClose}
      closeOnBackdrop={false}
      error={error}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton variant="primario" type="submit" form="formulario-horario" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Boton>
        </>
      }
    >
      <form id="formulario-horario" onSubmit={handleSubmit} noValidate autoComplete="off" className="space-y-4">
        <p className="text-sm text-texto">
          Horario de <strong>{doctorName}</strong>.
        </p>
        <FormField label="Día" required>
          <select
            className={inputClass}
            value={values.weekday}
            onChange={(event) => setValues({ ...values, weekday: event.target.value })}
            data-autofocus
          >
            {WEEKDAYS.map((day) => (
              <option key={day} value={String(day)}>
                {WEEKDAY_LABELS[day]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Sucursal" required>
          <select className={inputClass} value={values.branchId} onChange={(event) => changeBranch(event.target.value)}>
            {branches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Hora de inicio" required>
            <select
              className={inputClass}
              value={values.start}
              onChange={(event) => setValues({ ...values, start: event.target.value })}
            >
              {startOptions.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Hora de fin" required>
            <select
              className={inputClass}
              value={values.end}
              onChange={(event) => setValues({ ...values, end: event.target.value })}
            >
              {endOptions.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </form>
    </ModalShell>
  );
}
