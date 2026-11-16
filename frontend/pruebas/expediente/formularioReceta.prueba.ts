// =============================================================================
// formularioReceta.prueba.ts
// Qué prueba:   la lógica sin pantalla del formulario de recetas: valores de
//               partida, validación (rangos, pasos, esfera obligatoria, eje y
//               cilindro, al menos un ojo, distancia pupilar, nota) y el cuerpo
//               que se envía.
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  buildPrescriptionMeasures,
  EMPTY_PRESCRIPTION_FORM,
  formFromPrescription,
  validatePrescriptionForm,
  type PrescriptionFormValues,
} from '../../src/paginas/expediente/formularioReceta';

const eye = (sphere = '', cylinder = '', axis = '', addition = '') => ({ sphere, cylinder, axis, addition });
const form = (patch: Partial<PrescriptionFormValues> = {}): PrescriptionFormValues => ({
  ...EMPTY_PRESCRIPTION_FORM,
  od: eye('-1.50'),
  ...patch,
});
const problem = (patch: Partial<PrescriptionFormValues>) => validatePrescriptionForm(form(patch));

describe('validatePrescriptionForm — lo básico', () => {
  it('un solo ojo con esfera es suficiente', () => {
    expect(validatePrescriptionForm(form())).toBe('');
    expect(validatePrescriptionForm(form({ od: eye(), oi: eye('-2') }))).toBe('');
  });

  it('sin ningún ojo pide medir al menos uno', () => {
    expect(validatePrescriptionForm(EMPTY_PRESCRIPTION_FORM)).toBe('Indique las medidas de al menos un ojo.');
  });

  it('esfera 0 ("plano") cuenta como medida', () => {
    expect(validatePrescriptionForm(form({ od: eye('0') }))).toBe('');
  });

  it('acepta ".5" y "1." pero no un signo solo ni dos puntos', () => {
    expect(validatePrescriptionForm(form({ od: eye('.5') }))).toBe('');
    expect(validatePrescriptionForm(form({ od: eye('1.') }))).toBe('');
    expect(buildPrescriptionMeasures(form({ od: eye('.5') })).od_sphere).toBe(0.5);
    expect(validatePrescriptionForm(form({ od: eye('-') }))).toBe('La esfera del ojo derecho debe ser un número.');
    expect(validatePrescriptionForm(form({ od: eye('1.2.3') }))).toBe('La esfera del ojo derecho debe ser un número.');
    expect(validatePrescriptionForm(form({ od: eye('--1') }))).toBe('La esfera del ojo derecho debe ser un número.');
  });

  it('acepta coma, signo más y espacios', () => {
    expect(validatePrescriptionForm(form({ od: eye(' -1,25 ', ' -0,75', '90', '+1,5') }))).toBe('');
  });
});

describe('validatePrescriptionForm — esfera, cilindro, adición', () => {
  it.each([
    ['20.25', 'La esfera del ojo derecho debe estar entre -20 y 20, de 0.25 en 0.25.'],
    ['-20.25', 'La esfera del ojo derecho debe estar entre -20 y 20, de 0.25 en 0.25.'],
    ['-1.1', 'La esfera del ojo derecho debe estar entre -20 y 20, de 0.25 en 0.25.'],
  ])('esfera %s', (sphere, message) => {
    expect(validatePrescriptionForm(form({ od: eye(sphere) }))).toBe(message);
  });

  it('los extremos de la esfera valen', () => {
    expect(validatePrescriptionForm(form({ od: eye('20') }))).toBe('');
    expect(validatePrescriptionForm(form({ od: eye('-20') }))).toBe('');
  });

  it('el cilindro va de -8 a 8 de cuarto en cuarto', () => {
    expect(problem({ od: eye('-1', '-8.25', '10') })).toBe('El cilindro del ojo derecho debe estar entre -8 y 8, de 0.25 en 0.25.');
    expect(problem({ od: eye('-1', '8.25', '10') })).toBe('El cilindro del ojo derecho debe estar entre -8 y 8, de 0.25 en 0.25.');
    expect(problem({ od: eye('-1', '-0.6', '10') })).toBe('El cilindro del ojo derecho debe estar entre -8 y 8, de 0.25 en 0.25.');
    expect(problem({ od: eye('-1', '-8', '10') })).toBe('');
    expect(problem({ od: eye('-1', '8', '10') })).toBe('');
  });

  it('la adición va de 0.25 a 4 de cuarto en cuarto', () => {
    const message = 'La adición del ojo derecho debe estar entre 0.25 y 4, de 0.25 en 0.25.';
    expect(problem({ od: eye('-1', '', '', '0') })).toBe(message);
    expect(problem({ od: eye('-1', '', '', '4.25') })).toBe(message);
    expect(problem({ od: eye('-1', '', '', '1.1') })).toBe(message);
    expect(problem({ od: eye('-1', '', '', '0.25') })).toBe('');
    expect(problem({ od: eye('-1', '', '', '4') })).toBe('');
  });

  it('lo que no es un número se dice con el nombre del campo y del ojo', () => {
    expect(problem({ od: eye('abc') })).toBe('La esfera del ojo derecho debe ser un número.');
    expect(problem({ od: eye('-1', 'x') })).toBe('El cilindro del ojo derecho debe ser un número.');
    expect(problem({ od: eye('-1', '', 'x') })).toBe('El eje del ojo derecho debe ser un número.');
    expect(problem({ od: eye('-1', '', '', 'x') })).toBe('La adición del ojo derecho debe ser un número.');
    expect(problem({ od: eye(), oi: eye('1.2.3') })).toBe('La esfera del ojo izquierdo debe ser un número.');
  });
});

describe('validatePrescriptionForm — esfera obligatoria y eje', () => {
  it('un ojo con datos pero sin esfera: la pide, con el nombre del ojo', () => {
    expect(problem({ od: eye('', '-1', '90') })).toBe('Indique la esfera del ojo derecho (puede ser 0).');
    expect(problem({ od: eye('', '', '', '1') })).toBe('Indique la esfera del ojo derecho (puede ser 0).');
    expect(problem({ od: eye('-1'), oi: eye('', '', '90') })).toBe('Indique la esfera del ojo izquierdo (puede ser 0).');
  });

  it('con cilindro distinto de 0 pide el eje; sin cilindro no lo deja', () => {
    expect(problem({ od: eye('-1', '-0.75') })).toBe('Indique el eje del ojo derecho: tiene cilindro.');
    expect(problem({ od: eye('-1'), oi: eye('-1', '-0.75') })).toBe('Indique el eje del ojo izquierdo: tiene cilindro.');
    expect(problem({ od: eye('-1', '', '90') })).toBe('El ojo derecho no lleva eje sin cilindro.');
    expect(problem({ od: eye('-1', '0', '90') })).toBe('El ojo derecho no lleva eje sin cilindro.');
    expect(problem({ od: eye('-1'), oi: eye('-1', '', '90') })).toBe('El ojo izquierdo no lleva eje sin cilindro.');
  });

  it('cilindro 0 sin eje es válido', () => {
    expect(problem({ od: eye('-1', '0') })).toBe('');
  });

  it('el eje es entero de 1 a 180', () => {
    const message = 'El eje del ojo derecho debe ser un número entero entre 1 y 180.';
    expect(problem({ od: eye('-1', '-1', '0') })).toBe(message);
    expect(problem({ od: eye('-1', '-1', '181') })).toBe(message);
    expect(problem({ od: eye('-1', '-1', '90.5') })).toBe(message);
    expect(problem({ od: eye('-1', '-1', '1') })).toBe('');
    expect(problem({ od: eye('-1', '-1', '180') })).toBe('');
  });

  it('revisa el ojo derecho antes que el izquierdo', () => {
    expect(problem({ od: eye('99'), oi: eye('98') })).toContain('derecho');
  });
});

describe('validatePrescriptionForm — distancia pupilar y nota', () => {
  const message = 'La distancia pupilar debe estar entre 40 y 80, de 0.5 en 0.5.';
  it('va de 40 a 80 de medio en medio', () => {
    expect(problem({ pupillaryDistance: '39.5' })).toBe(message);
    expect(problem({ pupillaryDistance: '80.5' })).toBe(message);
    expect(problem({ pupillaryDistance: '62.3' })).toBe(message);
    expect(problem({ pupillaryDistance: '40' })).toBe('');
    expect(problem({ pupillaryDistance: '80' })).toBe('');
    expect(problem({ pupillaryDistance: '62,5' })).toBe('');
    expect(problem({ pupillaryDistance: '' })).toBe('');
  });

  it('un texto no es una distancia', () => {
    expect(problem({ pupillaryDistance: 'ancha' })).toBe('La distancia pupilar debe ser un número.');
  });

  it('la nota para el taller no pasa de 500 caracteres (sin contar espacios de los lados)', () => {
    expect(problem({ lensNotes: 'x'.repeat(500) })).toBe('');
    expect(problem({ lensNotes: `  ${'x'.repeat(500)}  ` })).toBe('');
    expect(problem({ lensNotes: 'x'.repeat(501) })).toBe('La nota para el taller no puede pasar de 500 caracteres.');
  });
});

describe('buildPrescriptionMeasures', () => {
  it('convierte el texto en números y lo vacío en null', () => {
    expect(
      buildPrescriptionMeasures({
        od: eye('-2,25', '-0.75', '90', '1.5'),
        oi: eye('0'),
        pupillaryDistance: '62,5',
        lensNotes: '  Antirreflejo  ',
      }),
    ).toEqual({
      od_sphere: -2.25, od_cylinder: -0.75, od_axis: 90, od_addition: 1.5,
      oi_sphere: 0, oi_cylinder: null, oi_axis: null, oi_addition: null,
      pupillary_distance: 62.5, lens_notes: 'Antirreflejo',
    });
  });

  it('un ojo sin medir y sin nota se envía todo null', () => {
    expect(buildPrescriptionMeasures(form({ od: eye(), oi: eye('-1') }))).toMatchObject({
      od_sphere: null, od_cylinder: null, od_axis: null, od_addition: null, oi_sphere: -1, pupillary_distance: null, lens_notes: null,
    });
  });

  it('una nota de solo espacios se envía como null', () => {
    expect(buildPrescriptionMeasures(form({ lensNotes: '   ' })).lens_notes).toBeNull();
  });
});

describe('formFromPrescription', () => {
  it('pone las medidas de la receta como texto, y lo vacío como cadena vacía', () => {
    const values = formFromPrescription({
      od_sphere: -2.25, od_cylinder: -0.75, od_axis: 90, od_addition: 1.5,
      oi_sphere: null, oi_cylinder: null, oi_axis: null, oi_addition: null,
      pupillary_distance: 62.5, lens_notes: 'Nota',
    });
    expect(values).toEqual({
      od: eye('-2.25', '-0.75', '90', '1.5'),
      oi: eye(),
      pupillaryDistance: '62.5',
      lensNotes: 'Nota',
    });
  });

  it('una receta con ceros los conserva (0 no es "vacío")', () => {
    const values = formFromPrescription({
      od_sphere: 0, od_cylinder: 0, od_axis: null, od_addition: null,
      oi_sphere: null, oi_cylinder: null, oi_axis: null, oi_addition: null,
      pupillary_distance: null, lens_notes: null,
    });
    expect(values.od).toEqual(eye('0', '0'));
    expect(values.lensNotes).toBe('');
  });

  it('el formulario de partida de un reemplazo pasa la validación si la receta era válida', () => {
    const values = formFromPrescription({
      od_sphere: -2.25, od_cylinder: -0.75, od_axis: 90, od_addition: 1.5,
      oi_sphere: -2, oi_cylinder: null, oi_axis: null, oi_addition: null,
      pupillary_distance: 62.5, lens_notes: null,
    });
    expect(validatePrescriptionForm(values)).toBe('');
  });
});
