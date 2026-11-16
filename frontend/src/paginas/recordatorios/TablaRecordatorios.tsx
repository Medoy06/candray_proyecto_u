// =============================================================================
// TablaRecordatorios.tsx
// Qué hace:     la tabla de la bandeja de recordatorios: cuándo es la cita, a
//               quién se le avisa (con su teléfono), con qué médico y el mensaje
//               que se enviaría.
// Depende de:   componentes/ui/Tabla.tsx, servicios/recordatorios.ts,
//               paginas/recordatorios/mensajeRecordatorio.ts y utilidades de fecha.
// Lo usa:       paginas/recordatorios/PaginaRecordatorios.tsx.
// =============================================================================
import { Tabla, type TablaColumna } from '../../componentes/ui/Tabla';
import type { Reminder } from '../../servicios/recordatorios';
import { formatDateTime } from '../../utilidades/formatoFecha';
import { reminderMessage } from './mensajeRecordatorio';

const COLUMNS: TablaColumna<Reminder>[] = [
  { id: 'when', header: 'Cita', noWrap: true, cell: (reminder) => formatDateTime(reminder.starts_at) },
  {
    id: 'patient',
    header: 'Paciente',
    cell: (reminder) => (
      <>
        <p className="font-medium text-texto">{reminder.patient_name}</p>
        <p className="text-xs text-texto-suave">{reminder.patient_phone}</p>
      </>
    ),
  },
  { id: 'doctor', header: 'Médico', cell: (reminder) => reminder.doctor_name },
  { id: 'message', header: 'Mensaje que se enviaría', cell: (reminder) => reminderMessage(reminder) },
];

export function TablaRecordatorios({ reminders }: { reminders: Reminder[] }) {
  return (
    <Tabla
      label="Recordatorios de citas"
      columns={COLUMNS}
      rows={reminders}
      rowKey={(reminder) => reminder.appointment_id}
    />
  );
}
