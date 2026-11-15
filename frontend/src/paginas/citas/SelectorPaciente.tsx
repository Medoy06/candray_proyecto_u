// =============================================================================
// SelectorPaciente.tsx
// Qué hace:     el campo para elegir el paciente de una cita: se escribe parte
//               del nombre, teléfono, DUI o expediente, aparecen los pacientes
//               activos que coinciden y se elige uno.
// Depende de:   componentes/ui, ganchos/useCarga.ts, useValorConRetraso.ts y
//               servicios/pacientes.ts.
// Lo usa:       paginas/citas/FormularioCita.tsx.
//
// Es un componente "tonto" respecto de la selección: el valor elegido vive en
// el formulario, aquí solo se avisa con onChange. Solo busca desde 2 letras (con
// menos habría demasiados resultados) y espera 300 ms tras la última tecla.
// =============================================================================
import { useState } from 'react';
import { Boton } from '../../componentes/ui/Boton';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { useCarga } from '../../ganchos/useCarga';
import { useValorConRetraso } from '../../ganchos/useValorConRetraso';
import { listPatients, type Patient, type PatientPage } from '../../servicios/pacientes';

export const MIN_SEARCH_LENGTH = 2;
const SEARCH_DELAY_MS = 300;
const NO_RESULTS: PatientPage = { rows: [], pagination: { page: 1, page_size: 25, total: 0, total_pages: 0 } };

// Lo mínimo del paciente elegido que necesita el formulario.
export type PatientChoice = Pick<Patient, 'id' | 'full_name' | 'record_number'>;

interface SelectorPacienteProps {
  value: PatientChoice | null;
  onChange: (patient: PatientChoice | null) => void;
}

export function SelectorPaciente({ value, onChange }: SelectorPacienteProps) {
  const [text, setText] = useState('');
  const term = useValorConRetraso(text.trim(), SEARCH_DELAY_MS);
  const { status, data, error } = useCarga(
    () => (term.length < MIN_SEARCH_LENGTH ? Promise.resolve(NO_RESULTS) : listPatients({ search: term, includeInactive: false }, 1)),
    [term],
    'No se pudo buscar pacientes.',
  );

  // Ya hay un paciente elegido: se muestra y se puede cambiar.
  if (value !== null) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-borde bg-superficie px-3 py-2">
        <p className="text-sm">
          <span className="text-texto-suave">Paciente: </span>
          <strong>{value.full_name}</strong> <span className="text-texto-suave">· Expediente {value.record_number}</span>
        </p>
        <Boton size="sm" onClick={() => onChange(null)}>
          Cambiar
        </Boton>
      </div>
    );
  }

  const typed = text.trim().length >= MIN_SEARCH_LENGTH;
  return (
    <div>
      <FormField label="Buscar paciente" required hint="Nombre, teléfono, DUI o número de expediente.">
        <input
          type="search"
          className={inputClass}
          value={text}
          onChange={(event) => setText(event.target.value)}
          data-autofocus
        />
      </FormField>
      <div className="mt-2" aria-live="polite">
        {status === 'error' && <p className="text-sm text-error-texto">{error}</p>}
        {typed && status === 'loading' && <p className="text-sm text-texto-suave">Buscando...</p>}
        {typed && status === 'ready' && data !== null && data.rows.length === 0 && (
          <p className="text-sm text-texto-suave">No hay pacientes activos que coincidan. Si es nuevo, regístrelo primero en Pacientes.</p>
        )}
        {data !== null && data.rows.length > 0 && typed && (
          <ul className="max-h-48 divide-y divide-borde overflow-y-auto rounded-md border border-borde" aria-label="Pacientes encontrados">
            {data.rows.map((patient) => (
              <li key={patient.id}>
                <button
                  type="button"
                  onClick={() => onChange({ id: patient.id, full_name: patient.full_name, record_number: patient.record_number })}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-apoyo"
                >
                  <span className="font-medium">{patient.full_name}</span>
                  <span className="text-xs text-texto-suave">Exp. {patient.record_number} · {patient.phone}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {data !== null && typed && data.pagination.total > data.rows.length && (
          <p className="mt-1 text-xs text-texto-suave">Hay más resultados: escriba más para afinar la búsqueda.</p>
        )}
      </div>
    </div>
  );
}
