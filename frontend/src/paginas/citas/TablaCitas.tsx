// =============================================================================
// TablaCitas.tsx
// Qué hace:     define las columnas de la agenda (hora, paciente, médico,
//               motivo, estado y acciones) y las dibuja con la tabla genérica.
// Depende de:   componentes/ui, paginas/citas/etiquetasCitas.ts,
//               servicios/citas.ts y utilidades/formatoFecha.ts.
// Lo usa:       paginas/citas/PaginaCitas.tsx.
//
// El médico no ve su propia columna "Médico", y una agenda de varias sucursales
// agrega la columna "Sucursal". No decide nada: avisa a la página cuando se pulsa una acción. La columna de
// acciones solo existe si la persona puede modificar citas (recepción), y solo
// las citas "Programadas" tienen acciones: una cita ya cerrada no se vuelve a
// tocar. Las citas canceladas muestran el motivo de la cancelación.
// =============================================================================
import { Boton } from '../../componentes/ui/Boton';
import { Etiqueta } from '../../componentes/ui/Etiqueta';
import { Tabla, type TablaColumna } from '../../componentes/ui/Tabla';
import type { Appointment } from '../../servicios/citas';
import { formatTime } from '../../utilidades/formatoFecha';
import { STATUS_LABELS, STATUS_TONES } from './etiquetasCitas';

interface TablaCitasProps {
  appointments: Appointment[];
  canManage: boolean;
  showDoctor: boolean;  // false cuando quien mira es el propio médico: todas las citas son suyas
  showBranch: boolean;  // true cuando la agenda mezcla varias sucursales
  onAttended: (appointment: Appointment) => void;
  onNoShow: (appointment: Appointment) => void;
  onReschedule: (appointment: Appointment) => void;
  onCancel: (appointment: Appointment) => void;
}

export function TablaCitas({ appointments, canManage, showDoctor, showBranch, onAttended, onNoShow, onReschedule, onCancel }: TablaCitasProps) {
  const columns: TablaColumna<Appointment>[] = [
    { id: 'time', header: 'Hora', noWrap: true, cell: (appointment) => formatTime(appointment.starts_at) },
    {
      id: 'patient',
      header: 'Paciente',
      cell: (appointment) => (
        <>
          <p className="font-medium text-texto">{appointment.patient_name}</p>
          <p className="text-xs text-texto-suave">
            Expediente {appointment.patient_record_number} · {appointment.patient_phone}
          </p>
        </>
      ),
    },
    {
      id: 'reason',
      header: 'Motivo',
      cell: (appointment) => (
        <>
          <p>{appointment.reason ?? 'Sin motivo'}</p>
          {appointment.status === 'cancelled' && (
            <p className="text-xs text-texto-suave">
              Cancelada: {appointment.cancellation_reason ?? 'sin motivo indicado'}
            </p>
          )}
        </>
      ),
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (appointment) => (
        <Etiqueta tone={STATUS_TONES[appointment.status]}>{STATUS_LABELS[appointment.status]}</Etiqueta>
      ),
    },
  ];

  // Las columnas opcionales van en su lugar, antes del motivo.
  const reasonAt = columns.findIndex((column) => column.id === 'reason');
  if (showDoctor) columns.splice(reasonAt, 0, { id: 'doctor', header: 'Médico', cell: (appointment) => appointment.doctor_name });
  if (showBranch) columns.splice(reasonAt, 0, { id: 'branch', header: 'Sucursal', cell: (appointment) => appointment.branch_name });

  if (canManage) {
    columns.push({
      id: 'actions',
      header: 'Acciones',
      align: 'right',
      cell: (appointment) =>
        appointment.status === 'scheduled' ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Boton size="sm" onClick={() => onAttended(appointment)} aria-label={`Marcar atendida la cita de ${appointment.patient_name}`}>
              Atendida
            </Boton>
            <Boton size="sm" onClick={() => onNoShow(appointment)} aria-label={`Marcar que ${appointment.patient_name} no asistió`}>
              No asistió
            </Boton>
            <Boton size="sm" onClick={() => onReschedule(appointment)} aria-label={`Reprogramar la cita de ${appointment.patient_name}`}>
              Reprogramar
            </Boton>
            <Boton size="sm" variant="peligro" onClick={() => onCancel(appointment)} aria-label={`Cancelar la cita de ${appointment.patient_name}`}>
              Cancelar
            </Boton>
          </div>
        ) : null,
    });
  }

  return <Tabla label="Agenda de citas" columns={columns} rows={appointments} rowKey={(appointment) => appointment.id} />;
}
