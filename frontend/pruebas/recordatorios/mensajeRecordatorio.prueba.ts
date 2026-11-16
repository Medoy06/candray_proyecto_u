// =============================================================================
// mensajeRecordatorio.prueba.ts
// Qué prueba:   que el mensaje del recordatorio lleve paciente, fecha, hora,
//               sucursal y médico, con la fecha y la hora escritas como en el
//               resto del sistema (día/mes/año y 24 horas).
// =============================================================================
import { describe, expect, it } from 'vitest';
import { reminderMessage } from '../../src/paginas/recordatorios/mensajeRecordatorio';
import type { Reminder } from '../../src/servicios/recordatorios';

const REMINDER: Reminder = {
  appointment_id: 'a1', starts_at: '2026-11-16 09:30:00', patient_name: 'Ana Pérez',
  patient_phone: '7000-1111', doctor_name: 'Dra. Lucía Rivas', branch_name: 'Candray Central',
};

describe('reminderMessage', () => {
  it('arma el texto completo', () => {
    expect(reminderMessage(REMINDER)).toBe(
      'Estimado(a) Ana Pérez: le recordamos su cita del 16/11/2026 a las 09:30 en Candray Central con Dra. Lucía Rivas.',
    );
  });

  it('una cita de la tarde se escribe en 24 horas', () => {
    expect(reminderMessage({ ...REMINDER, starts_at: '2026-11-17 16:00:00' })).toContain('del 17/11/2026 a las 16:00');
  });

  it('no incluye el teléfono: el mensaje no repite datos que no necesita', () => {
    expect(reminderMessage(REMINDER)).not.toContain('7000-1111');
  });
});
