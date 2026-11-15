// =============================================================================
// formularioCita.prueba.ts
// Qué prueba:   la lógica de agendar y reprogramar: si el horario elegido sigue
//               libre, la validación, y qué se envía al servidor (en una cita
//               nueva y, al reprogramar, solo lo que cambió).
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  buildNewAppointment,
  buildRescheduleChanges,
  chosenSlotIsFree,
  dayOf,
  timeOf,
  validateNewAppointment,
  type AppointmentFormValues,
} from '../../src/paginas/citas/formularioCita';
import type { Appointment } from '../../src/servicios/citas';
import type { DayAvailability } from '../../src/servicios/disponibilidad';

const AVAILABILITY: DayAvailability = {
  date: '2026-11-16', branch_id: 'b1', weekday: 1,
  doctors: [
    {
      doctor_id: 'd1', doctor_name: 'Dr. Mejía', blocks: [], free_count: 1,
      slots: [{ time: '08:00', status: 'free' }, { time: '08:30', status: 'booked' }, { time: '09:00', status: 'past' }],
    },
    { doctor_id: 'd2', doctor_name: 'Dra. Rivas', blocks: [], free_count: 1, slots: [{ time: '08:00', status: 'free' }] },
  ],
};

const APPOINTMENT = {
  id: 'c1', doctor_id: 'd1', starts_at: '2026-11-16 08:30:00', reason: 'Control',
} as Appointment;

const VALUES: AppointmentFormValues = { patientId: 'p1', date: '2026-11-16', slot: { doctorId: 'd1', time: '08:00' }, reason: '' };

describe('dayOf y timeOf', () => {
  it('sacan el día y la hora del texto, sin pasar por Date', () => {
    expect(dayOf(APPOINTMENT)).toBe('2026-11-16');
    expect(timeOf(APPOINTMENT)).toBe('08:30');
  });
});

describe('chosenSlotIsFree', () => {
  it('es cierto solo si el médico tiene esa hora y está libre', () => {
    expect(chosenSlotIsFree(AVAILABILITY, { doctorId: 'd1', time: '08:00' })).toBe(true);
    expect(chosenSlotIsFree(AVAILABILITY, { doctorId: 'd2', time: '08:00' })).toBe(true);
  });

  it('ocupada o ya pasada no cuenta', () => {
    expect(chosenSlotIsFree(AVAILABILITY, { doctorId: 'd1', time: '08:30' })).toBe(false);
    expect(chosenSlotIsFree(AVAILABILITY, { doctorId: 'd1', time: '09:00' })).toBe(false);
  });

  it('el mismo horario de otro médico no sirve para este', () => {
    expect(chosenSlotIsFree(AVAILABILITY, { doctorId: 'd2', time: '08:30' })).toBe(false);
  });

  it('un médico que no está o una hora que no existe no cuentan', () => {
    expect(chosenSlotIsFree(AVAILABILITY, { doctorId: 'otro', time: '08:00' })).toBe(false);
    expect(chosenSlotIsFree(AVAILABILITY, { doctorId: 'd1', time: '07:00' })).toBe(false);
  });

  it('sin disponibilidad cargada o sin horario elegido, no', () => {
    expect(chosenSlotIsFree(null, { doctorId: 'd1', time: '08:00' })).toBe(false);
    expect(chosenSlotIsFree(AVAILABILITY, null)).toBe(false);
  });
});

describe('validateNewAppointment', () => {
  it('con paciente y horario libre no hay problema', () => {
    expect(validateNewAppointment(VALUES, true)).toBe('');
  });

  it('sin paciente lo pide (antes que el horario)', () => {
    expect(validateNewAppointment({ ...VALUES, patientId: null, slot: null }, false)).toMatch(/paciente/);
  });

  it('sin horario, o con uno que ya no está libre, pide elegir otro', () => {
    expect(validateNewAppointment({ ...VALUES, slot: null }, false)).toMatch(/horario disponible/);
    expect(validateNewAppointment(VALUES, false)).toMatch(/horario disponible/);
  });
});

describe('buildNewAppointment', () => {
  it('arma el cuerpo con la sucursal y manda null si no hay motivo', () => {
    expect(buildNewAppointment(VALUES, 'b1')).toEqual({
      patient_id: 'p1', doctor_id: 'd1', branch_id: 'b1', date: '2026-11-16', time: '08:00', reason: null,
    });
  });

  it('limpia los espacios del motivo', () => {
    expect(buildNewAppointment({ ...VALUES, reason: '  Control  ' }, 'b1').reason).toBe('Control');
    expect(buildNewAppointment({ ...VALUES, reason: '   ' }, 'b1').reason).toBeNull();
  });
});

describe('buildRescheduleChanges', () => {
  const same: AppointmentFormValues = { patientId: null, date: '2026-11-16', slot: null, reason: 'Control' };

  it('sin horario nuevo y con el mismo motivo no envía nada', () => {
    expect(buildRescheduleChanges(APPOINTMENT, same)).toEqual({});
  });

  it('cambiar solo la hora envía solo la hora', () => {
    expect(buildRescheduleChanges(APPOINTMENT, { ...same, slot: { doctorId: 'd1', time: '09:30' } })).toEqual({ time: '09:30' });
  });

  it('cambiar solo de médico envía solo el médico', () => {
    expect(buildRescheduleChanges(APPOINTMENT, { ...same, slot: { doctorId: 'd2', time: '08:30' } })).toEqual({ doctor_id: 'd2' });
  });

  it('cambiar de día envía el día (y la hora si también cambió)', () => {
    expect(buildRescheduleChanges(APPOINTMENT, { ...same, date: '2026-11-17', slot: { doctorId: 'd1', time: '08:30' } })).toEqual({
      date: '2026-11-17',
    });
    expect(buildRescheduleChanges(APPOINTMENT, { ...same, date: '2026-11-17', slot: { doctorId: 'd1', time: '10:00' } })).toEqual({
      date: '2026-11-17', time: '10:00',
    });
  });

  it('cambiar solo el motivo no toca el horario; borrarlo envía null', () => {
    expect(buildRescheduleChanges(APPOINTMENT, { ...same, reason: ' Revisión ' })).toEqual({ reason: 'Revisión' });
    expect(buildRescheduleChanges(APPOINTMENT, { ...same, reason: '' })).toEqual({ reason: null });
  });

  it('un cambio de día sin horario elegido no se envía (el horario manda)', () => {
    expect(buildRescheduleChanges(APPOINTMENT, { ...same, date: '2026-11-20' })).toEqual({});
  });

  it('una cita sin motivo que sigue sin él no cuenta como cambio', () => {
    expect(buildRescheduleChanges({ ...APPOINTMENT, reason: null }, { ...same, reason: '  ' })).toEqual({});
  });
});
