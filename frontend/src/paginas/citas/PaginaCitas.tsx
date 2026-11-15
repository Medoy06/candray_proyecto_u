// =============================================================================
// PaginaCitas.tsx
// Qué hace:     la agenda de citas de un día en la sucursal activa: quién viene,
//               con qué médico y a qué hora. Recepción puede marcar una cita
//               como atendida, como "no asistió", cancelarla, reprogramarla o
//               agendar una cita nueva.
// Depende de:   ganchos/useCitas.ts, useSesion.ts, componentes/ui y los
//               componentes de esta carpeta.
// Lo usa:       navegacion/RutasAplicacion.tsx (ruta "citas", capacidad
//               appointments_read).
//
// Los médicos ven aquí SOLO sus propias citas (lo decide el backend) y ningún
// botón de modificar. Al cambiar de sucursal arriba, la agenda cambia sola.
// No hay "eliminar": una cita cancelada queda en la agenda con su motivo.
// Igual que las demás páginas, esta es la "directora": guarda la fecha, el
// filtro, la página, qué ventana está abierta y qué aviso se muestra.
// =============================================================================
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { AlertaExito } from '../../componentes/ui/AlertaExito';
import { Boton } from '../../componentes/ui/Boton';
import { ConfirmDialog } from '../../componentes/ui/ConfirmDialog';
import { EncabezadoPagina } from '../../componentes/ui/EncabezadoPagina';
import { Paginacion } from '../../componentes/ui/Paginacion';
import { useCitas } from '../../ganchos/useCitas';
import { useSesion } from '../../ganchos/useSesion';
import { changeAppointmentStatus, type Appointment, type AppointmentStatus } from '../../servicios/citas';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { todayText } from '../../utilidades/fechaLocal';
import { formatDate, formatTime } from '../../utilidades/formatoFecha';
import { dayOf, timeOf } from './formularioCita';
import { FiltrosCitas } from './FiltrosCitas';
import { FormularioCita } from './FormularioCita';
import { FormularioCancelarCita } from './FormularioCancelarCita';
import { TablaCitas } from './TablaCitas';

// Lo que se está confirmando: marcar atendida o marcar que no asistió.
type Closing = { appointment: Appointment; status: 'completed' | 'no_show' };

export function PaginaCitas() {
  const { can, activeBranch } = useSesion();
  const canManage = can('appointments_manage');
  const [date, setDate] = useState(() => todayText());
  const [status, setStatus] = useState<AppointmentStatus | ''>('');
  const [page, setPage] = useState(1);
  const [closing, setClosing] = useState<Closing | null>(null);
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [booking, setBooking] = useState(false);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const { status: loadStatus, data, error, reload } = useCitas(
    { date, branchId: activeBranch?.id ?? '', status },
    page,
  );

  if (activeBranch === null) return null;

  function changeDate(next: string) {
    setDate(next);
    setPage(1);
  }

  function changeStatus(next: AppointmentStatus | '') {
    setStatus(next);
    setPage(1);
  }

  // Después de agendar o reprogramar: cerrar la ventana, avisar y mostrar el día de la cita,
  // con todos los estados, para que la persona vea el resultado en la agenda.
  function finishBooking(message: string, saved: Appointment) {
    setBooking(false);
    setRescheduling(null);
    setActionError('');
    setNotice(message);
    const day = dayOf(saved);
    if (day === date && status === '' && page === 1) {
      reload(); // ya se está viendo ese día: solo hay que volver a pedirlo
    } else {
      setDate(day); // cambiar los filtros pide la agenda sola
      setStatus('');
      setPage(1);
    }
  }

  const describe = (saved: Appointment) =>
    `${formatDate(saved.starts_at)} a las ${timeOf(saved)} con ${saved.doctor_name}`;

  async function confirmClose() {
    const target = closing;
    if (target === null) return;
    setClosing(null); // se cierra de inmediato: evita un doble clic
    setNotice('');
    try {
      await changeAppointmentStatus(target.appointment.id, target.status);
      setActionError('');
      setNotice(
        target.status === 'completed'
          ? `La cita de ${target.appointment.patient_name} quedó como atendida.`
          : `Se registró que ${target.appointment.patient_name} no asistió.`,
      );
      reload();
    } catch (closeError: unknown) {
      setActionError(getApiErrorMessage(closeError, 'No se pudo cambiar el estado de la cita.'));
    }
  }

  // Abre una ventana limpiando los avisos anteriores.
  function open<T>(setter: (value: T) => void, value: T) {
    setNotice('');
    setActionError('');
    setter(value);
  }

  const empty = data !== null && data.rows.length === 0 && loadStatus !== 'error';

  return (
    <div>
      <EncabezadoPagina title="Citas" description={`Agenda de ${activeBranch.name}. Cada cita dura 30 minutos.`} />

      {notice !== '' && (
        <div className="mb-4">
          <AlertaExito message={notice} onClose={() => setNotice('')} />
        </div>
      )}
      {actionError !== '' && (
        <div className="mb-4">
          <AlertaError message={actionError} />
        </div>
      )}

      {canManage && (
        <div className="mb-4 flex justify-end">
          <Boton variant="primario" onClick={() => open(setBooking, true)}>
            <Plus className="size-4" aria-hidden="true" />
            Nueva cita
          </Boton>
        </div>
      )}

      <FiltrosCitas date={date} status={status} onDateChange={changeDate} onStatusChange={changeStatus} />

      {loadStatus === 'error' && (
        <div className="space-y-3">
          <AlertaError message={error ?? 'No se pudo cargar la agenda de citas.'} />
          <Boton variant="secundario" onClick={reload}>
            Reintentar
          </Boton>
        </div>
      )}
      {loadStatus === 'loading' && data === null && <p className="text-sm text-texto-suave">Cargando citas...</p>}
      {empty && (
        <p className="rounded-lg border border-borde bg-superficie p-6 text-center text-sm text-texto-suave">
          {status === '' ? 'No hay citas para este día.' : 'No hay citas con ese estado en este día.'}
        </p>
      )}
      {data !== null && data.rows.length > 0 && (
        <>
          <TablaCitas
            appointments={data.rows}
            canManage={canManage}
            onAttended={(appointment) => open(setClosing, { appointment, status: 'completed' })}
            onNoShow={(appointment) => open(setClosing, { appointment, status: 'no_show' })}
            onReschedule={(appointment) => open(setRescheduling, appointment)}
            onCancel={(appointment) => open(setCancelling, appointment)}
          />
          <Paginacion
            page={data.pagination.page}
            totalPages={data.pagination.total_pages}
            total={data.pagination.total}
            noun="citas"
            disabled={loadStatus === 'loading'}
            onPageChange={setPage}
          />
        </>
      )}

      {booking && (
        <FormularioCita
          branchId={activeBranch.id}
          initialDate={date}
          onClose={() => setBooking(false)}
          onSaved={(saved) => finishBooking(`Cita agendada para ${saved.patient_name}: ${describe(saved)}.`, saved)}
        />
      )}
      {rescheduling !== null && (
        <FormularioCita
          branchId={activeBranch.id}
          initialDate={date}
          appointment={rescheduling}
          onClose={() => setRescheduling(null)}
          onSaved={(saved) => finishBooking(`Cita de ${saved.patient_name} reprogramada: ${describe(saved)}.`, saved)}
        />
      )}
      {cancelling !== null && (
        <FormularioCancelarCita
          appointment={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={(saved) => {
            setCancelling(null);
            setActionError('');
            setNotice(`Se canceló la cita de ${saved.patient_name}.`);
            reload();
          }}
        />
      )}
      <ConfirmDialog
        isOpen={closing !== null}
        title={closing?.status === 'completed' ? 'Marcar como atendida' : 'Marcar como "No asistió"'}
        message={
          closing === null
            ? ''
            : `${closing.appointment.patient_name}, ${formatDate(closing.appointment.starts_at)} a las ${formatTime(closing.appointment.starts_at)}. ${
                closing.status === 'completed'
                  ? 'Use esto cuando el paciente ya fue atendido.'
                  : 'Use esto cuando el paciente no llegó a su cita.'
              } No se podrá cambiar después.`
        }
        confirmLabel={closing?.status === 'completed' ? 'Atendida' : 'No asistió'}
        onConfirm={() => void confirmClose()}
        onCancel={() => setClosing(null)}
      />
    </div>
  );
}
