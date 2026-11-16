// =============================================================================
// formularioNota.prueba.ts
// Qué prueba:   la lógica sin pantalla del formulario de notas: validación (los
//               mismos límites que el servidor), armado de los cuerpos (vacío =
//               null, espacios recortados) y los valores de partida de una enmienda.
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  buildAmendInput,
  buildCreateInput,
  DIAGNOSIS_MAX_LENGTH,
  EMPTY_NOTE_FORM,
  formFromEntry,
  NOTES_MAX_LENGTH,
  TREATMENT_MAX_LENGTH,
  validateNoteForm,
  type NoteFormValues,
} from '../../src/paginas/expediente/formularioNota';

const valid: NoteFormValues = { appointmentId: 'c1', diagnosis: 'Miopía', treatment: '', notes: '' };

describe('límites', () => {
  it('son los mismos que valida el servidor', () => {
    expect(DIAGNOSIS_MAX_LENGTH).toBe(2000);
    expect(TREATMENT_MAX_LENGTH).toBe(2000);
    expect(NOTES_MAX_LENGTH).toBe(4000);
  });
});

describe('validateNoteForm', () => {
  it('un formulario correcto no tiene problemas', () => {
    expect(validateNoteForm(valid, true)).toBe('');
  });

  it('al escribir una nota nueva hay que elegir la consulta; al enmendar no', () => {
    const withoutAppointment = { ...valid, appointmentId: '' };
    expect(validateNoteForm(withoutAppointment, true)).toBe('Elija la consulta a la que pertenece la nota.');
    expect(validateNoteForm(withoutAppointment, false)).toBe('');
  });

  it('el diagnóstico es obligatorio, y un diagnóstico de solo espacios no cuenta', () => {
    expect(validateNoteForm({ ...valid, diagnosis: '' }, true)).toBe('El diagnóstico es obligatorio.');
    expect(validateNoteForm({ ...valid, diagnosis: '    ' }, true)).toBe('El diagnóstico es obligatorio.');
  });

  it.each([
    ['diagnosis', DIAGNOSIS_MAX_LENGTH, 'El diagnóstico no puede pasar de 2000 caracteres.'],
    ['treatment', TREATMENT_MAX_LENGTH, 'El tratamiento no puede pasar de 2000 caracteres.'],
    ['notes', NOTES_MAX_LENGTH, 'Las notas no pueden pasar de 4000 caracteres.'],
  ] as const)('%s: acepta exactamente el máximo y rechaza uno más', (field, max, message) => {
    expect(validateNoteForm({ ...valid, [field]: 'x'.repeat(max) }, true)).toBe('');
    expect(validateNoteForm({ ...valid, [field]: 'x'.repeat(max + 1) }, true)).toBe(message);
  });

  it('el largo se mide sin los espacios de los extremos (como el servidor)', () => {
    expect(validateNoteForm({ ...valid, diagnosis: `  ${'x'.repeat(DIAGNOSIS_MAX_LENGTH)}  ` }, true)).toBe('');
  });
});

describe('buildCreateInput y buildAmendInput', () => {
  it('recortan los espacios y mandan null en lo opcional vacío', () => {
    const values = { appointmentId: 'c1', diagnosis: '  Miopía  ', treatment: '   ', notes: '' };
    expect(buildCreateInput(values)).toEqual({ appointment_id: 'c1', diagnosis: 'Miopía', treatment: null, notes: null });
    expect(buildAmendInput(values)).toEqual({ diagnosis: 'Miopía', treatment: null, notes: null });
  });

  it('conservan el tratamiento y las notas cuando hay texto', () => {
    const values = { appointmentId: 'c1', diagnosis: 'Miopía', treatment: ' Lentes ', notes: ' Control ' };
    expect(buildCreateInput(values)).toMatchObject({ treatment: 'Lentes', notes: 'Control' });
  });

  it('la enmienda no lleva el id de la consulta', () => {
    expect(buildAmendInput(valid)).not.toHaveProperty('appointment_id');
  });
});

describe('formFromEntry', () => {
  it('parte del contenido de la nota; null se vuelve texto vacío y no hay consulta elegida', () => {
    expect(formFromEntry({ diagnosis: 'Miopía', treatment: null, notes: 'Control' })).toEqual({
      appointmentId: '', diagnosis: 'Miopía', treatment: '', notes: 'Control',
    });
  });

  it('el formulario vacío no trae nada', () => {
    expect(EMPTY_NOTE_FORM).toEqual({ appointmentId: '', diagnosis: '', treatment: '', notes: '' });
  });
});
