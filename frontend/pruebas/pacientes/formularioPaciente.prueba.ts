// =============================================================================
// formularioPaciente.prueba.ts
// Qué prueba:   la lógica del formulario de pacientes: validación (cada regla
//               y sus bordes), valores iniciales y lo que se envía al servidor
//               al registrar y al editar (solo lo cambiado).
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  buildCreateInput,
  buildPatientChanges,
  EMPTY_PATIENT_FORM,
  formFromPatient,
  todayText,
  validatePatientForm,
  type PatientFormValues,
} from '../../src/paginas/pacientes/formularioPaciente';
import type { Patient } from '../../src/servicios/pacientes';

const TODAY = '2026-11-15';
const VALID: PatientFormValues = {
  full_name: 'Ana Pérez',
  birth_date: '1990-05-20',
  phone: '7000-1111',
  dui: '',
  email: '',
};
const check = (changes: Partial<PatientFormValues>) => validatePatientForm({ ...VALID, ...changes }, TODAY);

const PATIENT: Patient = {
  id: 'p1', record_number: 7, full_name: 'Ana Pérez', birth_date: '1990-05-20', phone: '7000-1111',
  dui: '01234567-8', email: 'ana@correo.com', is_active: true, created_at: '', updated_at: '',
};

describe('todayText', () => {
  it('escribe la fecha local con ceros a la izquierda', () => {
    expect(todayText(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(todayText(new Date(2026, 10, 15))).toBe('2026-11-15');
  });
});

describe('validatePatientForm', () => {
  it('con los datos mínimos correctos no hay problema', () => {
    expect(check({})).toBe('');
  });

  it('con todos los datos (DUI y correo) tampoco', () => {
    expect(check({ dui: '01234567-8', email: 'ana@correo.com' })).toBe('');
  });

  it('el nombre pide al menos 2 caracteres (sin contar espacios de los lados)', () => {
    expect(check({ full_name: '' })).toMatch(/nombre completo/);
    expect(check({ full_name: ' A ' })).toMatch(/nombre completo/);
    expect(check({ full_name: 'Al' })).toBe('');
  });

  it('el nombre no pasa de 255 caracteres', () => {
    expect(check({ full_name: 'a'.repeat(255) })).toBe('');
    expect(check({ full_name: 'a'.repeat(256) })).toMatch(/demasiado largo/);
  });

  it('la fecha de nacimiento es obligatoria', () => {
    expect(check({ birth_date: '' })).toMatch(/Indique la fecha/);
  });

  it('rechaza fechas que no existen o mal escritas', () => {
    expect(check({ birth_date: '2026-02-31' })).toMatch(/no es válida/);
    expect(check({ birth_date: '1990-13-01' })).toMatch(/no es válida/);
    expect(check({ birth_date: '90-05-20' })).toMatch(/no es válida/);
    expect(check({ birth_date: '12345-01-01' })).toMatch(/no es válida/);
  });

  it('acepta el 29 de febrero solo en año bisiesto', () => {
    expect(check({ birth_date: '2000-02-29' })).toBe('');
    expect(check({ birth_date: '2001-02-29' })).toMatch(/no es válida/);
  });

  it('desde 1900-01-01 (el borde se acepta, el día anterior no)', () => {
    expect(check({ birth_date: '1900-01-01' })).toBe('');
    expect(check({ birth_date: '1899-12-31' })).toMatch(/demasiado antigua/);
  });

  it('no puede ser futura (hoy se acepta, mañana no)', () => {
    expect(check({ birth_date: TODAY })).toBe('');
    expect(check({ birth_date: '2026-11-16' })).toMatch(/futura/);
  });

  it('el teléfono es obligatorio', () => {
    expect(check({ phone: '' })).toMatch(/Escriba el teléfono/);
    expect(check({ phone: '   ' })).toMatch(/Escriba el teléfono/);
  });

  it('el teléfono lleva de 8 a 30 caracteres (los bordes se aceptan)', () => {
    expect(check({ phone: '1234567' })).toMatch(/entre 8 y 30/);
    expect(check({ phone: '12345678' })).toBe('');
    expect(check({ phone: '1'.repeat(30) })).toBe('');
    expect(check({ phone: '1'.repeat(31) })).toMatch(/entre 8 y 30/);
  });

  it('el teléfono solo admite números, espacios, guion, + y paréntesis', () => {
    expect(check({ phone: '+503 (7000) 1111' })).toBe('');
    expect(check({ phone: '7000-abcd' })).toMatch(/entre 8 y 30/);
    expect(check({ phone: '7000.1111' })).toMatch(/entre 8 y 30/);
  });

  it('el DUI, si se escribe, debe ser NNNNNNNN-N', () => {
    expect(check({ dui: '01234567-8' })).toBe('');
    expect(check({ dui: '012345678' })).toMatch(/DUI/);
    expect(check({ dui: '1234567-89' })).toMatch(/DUI/);
    expect(check({ dui: '01234567-A' })).toMatch(/DUI/);
    expect(check({ dui: '   ' })).toBe(''); // solo espacios = sin DUI
  });

  it('el correo, si se escribe, debe parecer un correo', () => {
    expect(check({ email: 'ana@correo.com' })).toBe('');
    expect(check({ email: 'ana' })).toMatch(/correo/);
    expect(check({ email: 'ana@correo' })).toMatch(/correo/);
    expect(check({ email: 'a na@correo.com' })).toMatch(/correo/);
    expect(check({ email: `${'a'.repeat(250)}@x.com` })).toMatch(/correo/); // más de 255
  });

  it('informa el primer problema en el orden de la pantalla', () => {
    expect(check({ full_name: '', birth_date: '', phone: '' })).toMatch(/nombre/);
    expect(check({ birth_date: '', phone: '' })).toMatch(/fecha/);
  });
});

describe('formFromPatient', () => {
  it('copia los datos y deja en blanco lo que falta', () => {
    expect(formFromPatient(PATIENT)).toEqual({
      full_name: 'Ana Pérez', birth_date: '1990-05-20', phone: '7000-1111', dui: '01234567-8', email: 'ana@correo.com',
    });
    expect(formFromPatient({ ...PATIENT, dui: null, email: null })).toMatchObject({ dui: '', email: '' });
  });

  it('el formulario vacío empieza sin ningún dato', () => {
    expect(Object.values(EMPTY_PATIENT_FORM).every((value) => value === '')).toBe(true);
  });
});

describe('buildCreateInput', () => {
  it('limpia espacios y manda null en lo opcional vacío', () => {
    expect(buildCreateInput({ ...VALID, full_name: '  Ana Pérez ', phone: ' 7000-1111 ', dui: '  ', email: '' })).toEqual({
      full_name: 'Ana Pérez', birth_date: '1990-05-20', phone: '7000-1111', dui: null, email: null,
    });
  });

  it('manda el DUI y el correo (en minúsculas) cuando existen', () => {
    expect(buildCreateInput({ ...VALID, dui: ' 01234567-8 ', email: ' Ana@Correo.COM ' })).toMatchObject({
      dui: '01234567-8', email: 'ana@correo.com',
    });
  });
});

describe('buildPatientChanges', () => {
  const same = formFromPatient(PATIENT);

  it('sin cambios no envía nada', () => {
    expect(buildPatientChanges(PATIENT, same)).toEqual({});
  });

  it('espacios sobrantes y mayúsculas del correo no cuentan como cambio', () => {
    expect(buildPatientChanges(PATIENT, { ...same, full_name: ' Ana Pérez ', email: 'ANA@correo.com' })).toEqual({});
  });

  it('envía solo el campo que cambió', () => {
    expect(buildPatientChanges(PATIENT, { ...same, phone: '7222-3333' })).toEqual({ phone: '7222-3333' });
    expect(buildPatientChanges(PATIENT, { ...same, full_name: 'Ana P. Pérez' })).toEqual({ full_name: 'Ana P. Pérez' });
    expect(buildPatientChanges(PATIENT, { ...same, birth_date: '1991-01-01' })).toEqual({ birth_date: '1991-01-01' });
    expect(buildPatientChanges(PATIENT, { ...same, dui: '99999999-9' })).toEqual({ dui: '99999999-9' });
    expect(buildPatientChanges(PATIENT, { ...same, email: 'nuevo@correo.com' })).toEqual({ email: 'nuevo@correo.com' });
  });

  it('borrar el DUI o el correo envía null', () => {
    expect(buildPatientChanges(PATIENT, { ...same, dui: '', email: '' })).toEqual({ dui: null, email: null });
  });

  it('un paciente sin DUI ni correo que sigue sin ellos no genera cambios', () => {
    const bare = { ...PATIENT, dui: null, email: null };
    expect(buildPatientChanges(bare, formFromPatient(bare))).toEqual({});
  });
});
