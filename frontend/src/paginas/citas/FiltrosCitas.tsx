// =============================================================================
// FiltrosCitas.tsx
// Qué hace:     la barra de la agenda: ir al día anterior o siguiente, volver a
//               hoy, elegir una fecha y filtrar por estado. Muestra el día de la
//               semana de la fecha elegida.
// Depende de:   componentes/ui, paginas/citas/etiquetasCitas.ts y
//               utilidades/fechaLocal.ts.
// Lo usa:       paginas/citas/PaginaCitas.tsx.
//
// Es un componente "tonto": no consulta nada; solo avisa lo que la persona elige.
// Si la fecha queda vacía (se borró el campo), avisa con '' y la página la ignora.
// =============================================================================
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Boton } from '../../componentes/ui/Boton';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import type { AppointmentStatus } from '../../servicios/citas';
import { addDays, todayText, weekdayName } from '../../utilidades/fechaLocal';
import { STATUS_LABELS, STATUS_ORDER } from './etiquetasCitas';

interface FiltrosCitasProps {
  date: string;
  status: AppointmentStatus | '';
  onDateChange: (date: string) => void;
  onStatusChange: (status: AppointmentStatus | '') => void;
}

export function FiltrosCitas({ date, status, onDateChange, onStatusChange }: FiltrosCitasProps) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div className="flex items-end gap-2">
        <Boton size="icono" onClick={() => onDateChange(addDays(date, -1))} aria-label="Día anterior" title="Día anterior">
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Boton>
        <FormField label="Fecha" hint={<span className="capitalize">{weekdayName(date)}</span>}>
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(event) => {
              if (event.target.value !== '') onDateChange(event.target.value);
            }}
          />
        </FormField>
        <Boton size="icono" onClick={() => onDateChange(addDays(date, 1))} aria-label="Día siguiente" title="Día siguiente">
          <ChevronRight className="size-4" aria-hidden="true" />
        </Boton>
        <Boton onClick={() => onDateChange(todayText())} disabled={date === todayText()}>
          Hoy
        </Boton>
      </div>
      <FormField label="Estado">
        <select
          className={inputClass}
          value={status}
          onChange={(event) => onStatusChange(event.target.value as AppointmentStatus | '')}
        >
          <option value="">Todos</option>
          {STATUS_ORDER.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </FormField>
    </div>
  );
}
