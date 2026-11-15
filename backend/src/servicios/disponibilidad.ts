// =============================================================================
// disponibilidad.ts (servicio)
// Qué hace:     calcula, para una sucursal y un día, qué médicos atienden y
//               cuáles de sus franjas de 30 minutos están libres.
// Requerimiento: capacidad availability_read (sección 7 del documento de diseño).
// Depende de:   modelos/disponibilidad.ts, utilidades/franjas.ts y
//               utilidades/fechas.ts.
// Lo usa:       controladores/disponibilidad.ts.
//
// Estado de cada franja:
//   - booked: el médico ya tiene una cita (en esta u otra sucursal).
//   - past:   la hora ya pasó (no se puede agendar en el pasado).
//   - free:   se puede agendar.
// Si una franja está ocupada Y ya pasó, se muestra como ocupada.
// =============================================================================
import { listBusyAppointments, listDayBlocks, type BusyAppointment } from '../modelos/disponibilidad';
import { isoWeekday, nowInElSalvador } from '../utilidades/fechas';
import { SLOT_MINUTES, slotStartsInBlock, toHourMinute, toMinutes } from '../utilidades/franjas';

export type SlotStatus = 'free' | 'booked' | 'past';

export interface Slot {
  time: string; // 'HH:MM'
  status: SlotStatus;
}

export interface DoctorAvailability {
  doctor_id: string;
  doctor_name: string;
  blocks: { start_time: string; end_time: string }[];
  slots: Slot[];
  free_count: number;
}

export interface DayAvailability {
  date: string;
  branch_id: string;
  weekday: number;
  doctors: DoctorAvailability[];
}

// Decide el estado de una franja. `now` y las horas de las citas son texto
// 'AAAA-MM-DD HH:MM', que se compara de menor a mayor como texto.
function slotStatus(date: string, time: string, busy: BusyAppointment[], now: string): SlotStatus {
  const start = `${date} ${time}`;
  const end = `${date} ${toHourMinute(toMinutes(time) + SLOT_MINUTES)}`;
  // Se cruzan si la cita empieza antes de que termine la franja y termina
  // después de que empiece.
  const isBooked = busy.some(
    (appointment) => appointment.starts_at.slice(0, 16) < end && appointment.ends_at.slice(0, 16) > start,
  );
  if (isBooked) return 'booked';
  return start <= now ? 'past' : 'free';
}

// Calcula la disponibilidad de un día en una sucursal.
// Recibe: la fecha, la sucursal y (opcional) un médico. `now` solo se pasa en
// pruebas; normalmente es la hora actual de El Salvador.
export async function getDayAvailability(
  date: string,
  branchId: string,
  doctorId: string | null,
  now: string = nowInElSalvador(),
): Promise<DayAvailability> {
  const weekday = isoWeekday(date);
  const blocks = await listDayBlocks(branchId, weekday, doctorId);
  const doctorIds = [...new Set(blocks.map((block) => block.doctor_id))];
  const busy = await listBusyAppointments(doctorIds, date);

  const doctors: DoctorAvailability[] = doctorIds.map((id) => {
    const doctorBlocks = blocks.filter((block) => block.doctor_id === id);
    const doctorBusy = busy.filter((appointment) => appointment.doctor_id === id);
    const slots = doctorBlocks
      .flatMap((block) => slotStartsInBlock(block.start_time, block.end_time))
      .map((time) => ({ time, status: slotStatus(date, time, doctorBusy, now) }));
    return {
      doctor_id: id,
      doctor_name: doctorBlocks[0].doctor_name,
      blocks: doctorBlocks.map((block) => ({
        start_time: block.start_time.slice(0, 5),
        end_time: block.end_time.slice(0, 5),
      })),
      slots,
      free_count: slots.filter((slot) => slot.status === 'free').length,
    };
  });

  return { date, branch_id: branchId, weekday, doctors };
}
