// =============================================================================
// formularioHorario.prueba.ts
// Qué prueba:   las funciones puras del formulario de horarios: las horas que
//               se pueden elegir, la validación y lo que se envía al servidor.
// Cómo:         llama a las funciones directamente, sin pantalla ni servidor.
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  buildChanges, buildCreateInput, initialValues, timeOptions, validateScheduleForm, withValue,
} from '../../src/paginas/horarios/formularioHorario';
import type { ScheduleBlock } from '../../src/servicios/horarios';

const BLOCK: ScheduleBlock = {
  id: 'h1', doctor_id: 'u2', doctor_name: 'Marta Doctora', branch_id: 'b1', branch_code: 'CENTRAL',
  branch_name: 'Candray Central', weekday: 2, start_time: '08:00:00', end_time: '12:00:00', created_at: '',
};
const VALUES = { weekday: '2', branchId: 'b1', start: '08:00', end: '12:00' };

describe('timeOptions', () => {
  it('da horas de 30 en 30 minutos, de la apertura al cierre, ambas incluidas', () => {
    expect(timeOptions('08:00:00', '10:00:00')).toEqual(['08:00', '08:30', '09:00', '09:30', '10:00']);
  });

  it('respeta una apertura o un cierre en y media', () => {
    expect(timeOptions('08:30:00', '09:30:00')).toEqual(['08:30', '09:00', '09:30']);
  });
});

describe('withValue', () => {
  it('no cambia la lista si el valor ya está', () => {
    expect(withValue(['08:00', '08:30'], '08:30')).toEqual(['08:00', '08:30']);
  });

  it('agrega en su lugar un valor que no está', () => {
    expect(withValue(['08:00', '09:00'], '08:30')).toEqual(['08:00', '08:30', '09:00']);
  });

  it('un valor vacío no se agrega', () => {
    expect(withValue(['08:00'], '')).toEqual(['08:00']);
  });
});

describe('validateScheduleForm', () => {
  it('un formulario correcto no tiene problemas', () => {
    expect(validateScheduleForm(VALUES)).toBe('');
  });

  it('pide la sucursal', () => {
    expect(validateScheduleForm({ ...VALUES, branchId: '' })).toBe('Elija la sucursal.');
  });

  it('pide las dos horas', () => {
    expect(validateScheduleForm({ ...VALUES, start: '' })).toBe('Elija la hora de inicio y la de fin.');
    expect(validateScheduleForm({ ...VALUES, end: '' })).toBe('Elija la hora de inicio y la de fin.');
  });

  it('el inicio debe ser anterior al fin (también si son iguales)', () => {
    const message = 'La hora de inicio debe ser anterior a la de fin.';
    expect(validateScheduleForm({ ...VALUES, start: '12:00', end: '08:00' })).toBe(message);
    expect(validateScheduleForm({ ...VALUES, start: '09:00', end: '09:00' })).toBe(message);
  });

  it('compara las horas como horas y no como texto', () => {
    expect(validateScheduleForm({ ...VALUES, start: '09:00', end: '10:00' })).toBe('');
    expect(validateScheduleForm({ ...VALUES, start: '10:00', end: '09:30' })).not.toBe('');
  });
});

describe('initialValues', () => {
  it('un bloque nuevo propone el lunes y el horario completo de la sucursal', () => {
    expect(initialValues(null, 'b1', '08:00:00', '17:00:00')).toEqual({ weekday: '1', branchId: 'b1', start: '08:00', end: '17:00' });
  });

  it('un bloque existente trae sus propios valores, con las horas sin segundos', () => {
    expect(initialValues(BLOCK, 'otra', '07:00:00', '18:00:00')).toEqual(VALUES);
  });
});

describe('buildCreateInput', () => {
  it('arma lo que se envía, con el día como número', () => {
    expect(buildCreateInput('u2', VALUES)).toEqual({
      doctor_id: 'u2', branch_id: 'b1', weekday: 2, start_time: '08:00', end_time: '12:00',
    });
  });
});

describe('buildChanges', () => {
  it('sin cambios no envía nada', () => {
    expect(buildChanges(BLOCK, VALUES)).toEqual({});
  });

  it('envía solo lo que cambió', () => {
    expect(buildChanges(BLOCK, { ...VALUES, end: '13:00' })).toEqual({ end_time: '13:00' });
    expect(buildChanges(BLOCK, { ...VALUES, weekday: '4' })).toEqual({ weekday: 4 });
    expect(buildChanges(BLOCK, { ...VALUES, branchId: 'b2' })).toEqual({ branch_id: 'b2' });
    expect(buildChanges(BLOCK, { ...VALUES, start: '09:00' })).toEqual({ start_time: '09:00' });
  });
});
