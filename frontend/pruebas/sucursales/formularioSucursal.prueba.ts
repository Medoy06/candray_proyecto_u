// =============================================================================
// formularioSucursal.prueba.ts
// Qué prueba:   la lógica del formulario de sucursales: valores iniciales,
//               cada regla de validación (con su mensaje) y cómo se arma lo que
//               se envía al crear y al editar (solo lo cambiado).
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  buildBranchChanges,
  buildCreateInput,
  EMPTY_BRANCH_FORM,
  formFromBranch,
  validateBranchForm,
  type BranchFormValues,
} from '../../src/paginas/sucursales/formularioSucursal';
import type { ManagedBranch } from '../../src/servicios/sucursales';

const BRANCH: ManagedBranch = {
  id: 'b1', code: 'CENTRAL', name: 'Candray Central', address: 'Calle 1', phone: '2233-6500',
  opening_time: '08:00:00', closing_time: '18:00:00', theme_color: '#003449', has_optical_counter: true,
  is_active: true, created_at: '', user_count: 3,
};
const VALID: BranchFormValues = { ...EMPTY_BRANCH_FORM, code: 'NUEVA', name: 'Candray Nueva' };

describe('formFromBranch', () => {
  it('pasa las horas a HH:MM y los datos vacíos a texto vacío', () => {
    expect(formFromBranch({ ...BRANCH, address: null, phone: null })).toEqual({
      code: 'CENTRAL', name: 'Candray Central', address: '', phone: '', opening_time: '08:00',
      closing_time: '18:00', theme_color: '#003449', has_optical_counter: true,
    });
  });
});

describe('validateBranchForm', () => {
  it('un formulario correcto no tiene problemas', () => {
    expect(validateBranchForm(VALID, 'create')).toBe('');
    expect(validateBranchForm(formFromBranch(BRANCH), 'edit')).toBe('');
  });

  it.each(['', 'A', '1', 'a', 'minuscula', 'CON ESPACIO', 'CON-GUION', 'X'.repeat(21)])('rechaza el código %j al crear', (code) => {
    expect(validateBranchForm({ ...VALID, code }, 'create')).toMatch(/El código usa solo MAYÚSCULAS/);
  });

  it('acepta números y guion bajo en el código, con 2 y con 20 caracteres', () => {
    expect(validateBranchForm({ ...VALID, code: 'S_1' }, 'create')).toBe('');
    expect(validateBranchForm({ ...VALID, code: 'AB' }, 'create')).toBe('');
    expect(validateBranchForm({ ...VALID, code: 'X'.repeat(20) }, 'create')).toBe('');
  });

  it('al editar no revisa el código (no se puede cambiar)', () => {
    expect(validateBranchForm({ ...VALID, code: 'no válido' }, 'edit')).toBe('');
  });

  it('el nombre necesita 2 caracteres sin contar espacios', () => {
    expect(validateBranchForm({ ...VALID, name: ' a ' }, 'create')).toMatch(/nombre/);
    expect(validateBranchForm({ ...VALID, name: 'ab' }, 'create')).toBe('');
  });

  it('limita la dirección a 500 y el teléfono a 30', () => {
    expect(validateBranchForm({ ...VALID, address: 'x'.repeat(501) }, 'create')).toMatch(/dirección/);
    expect(validateBranchForm({ ...VALID, address: 'x'.repeat(500) }, 'create')).toBe('');
    expect(validateBranchForm({ ...VALID, phone: '1'.repeat(31) }, 'create')).toMatch(/teléfono/);
    expect(validateBranchForm({ ...VALID, phone: '1'.repeat(30) }, 'create')).toBe('');
  });

  it('pide las dos horas, en formato HH:MM', () => {
    expect(validateBranchForm({ ...VALID, opening_time: '' }, 'create')).toMatch(/apertura y la de cierre/);
    expect(validateBranchForm({ ...VALID, closing_time: '25:00' }, 'create')).toMatch(/apertura y la de cierre/);
  });

  it('la apertura debe ser anterior al cierre (igual tampoco sirve)', () => {
    expect(validateBranchForm({ ...VALID, opening_time: '18:00', closing_time: '08:00' }, 'create')).toMatch(/anterior/);
    expect(validateBranchForm({ ...VALID, opening_time: '09:00', closing_time: '09:00' }, 'create')).toMatch(/anterior/);
    expect(validateBranchForm({ ...VALID, opening_time: '08:00', closing_time: '08:01' }, 'create')).toBe('');
  });

  it('el color debe ser #RRGGBB', () => {
    expect(validateBranchForm({ ...VALID, theme_color: 'rojo' }, 'create')).toMatch(/color/);
    expect(validateBranchForm({ ...VALID, theme_color: '#fff' }, 'create')).toMatch(/color/);
    expect(validateBranchForm({ ...VALID, theme_color: '#AbCdEf' }, 'create')).toBe('');
  });
});

describe('buildCreateInput', () => {
  it('recorta el nombre y manda null en la dirección y el teléfono vacíos', () => {
    expect(buildCreateInput({ ...VALID, name: '  Candray Nueva ', address: '  ', phone: '' })).toEqual({
      code: 'NUEVA', name: 'Candray Nueva', address: null, phone: null, opening_time: '08:00',
      closing_time: '18:00', theme_color: EMPTY_BRANCH_FORM.theme_color, has_optical_counter: false,
    });
  });

  it('recorta la dirección y el teléfono con datos', () => {
    const input = buildCreateInput({ ...VALID, address: ' Calle 5 ', phone: ' 2200-0000 ' });
    expect(input.address).toBe('Calle 5');
    expect(input.phone).toBe('2200-0000');
  });
});

describe('buildBranchChanges', () => {
  const same = formFromBranch(BRANCH);

  it('sin cambios, no envía nada', () => {
    expect(buildBranchChanges(BRANCH, same)).toEqual({});
  });

  it('envía solo el campo que cambió', () => {
    expect(buildBranchChanges(BRANCH, { ...same, name: 'Otro nombre' })).toEqual({ name: 'Otro nombre' });
    expect(buildBranchChanges(BRANCH, { ...same, closing_time: '17:00' })).toEqual({ closing_time: '17:00' });
    expect(buildBranchChanges(BRANCH, { ...same, opening_time: '07:30' })).toEqual({ opening_time: '07:30' });
    expect(buildBranchChanges(BRANCH, { ...same, has_optical_counter: false })).toEqual({ has_optical_counter: false });
    expect(buildBranchChanges(BRANCH, { ...same, theme_color: '#112233' })).toEqual({ theme_color: '#112233' });
  });

  it('el espacio sobrante no cuenta como cambio', () => {
    expect(buildBranchChanges(BRANCH, { ...same, name: ' Candray Central ' })).toEqual({});
  });

  it('el mismo color en otra capitalización no cuenta como cambio', () => {
    expect(buildBranchChanges({ ...BRANCH, theme_color: '#00AABB' }, { ...same, theme_color: '#00aabb' })).toEqual({});
  });

  it('vaciar la dirección o el teléfono envía null', () => {
    expect(buildBranchChanges(BRANCH, { ...same, address: '' })).toEqual({ address: null });
    expect(buildBranchChanges(BRANCH, { ...same, phone: '  ' })).toEqual({ phone: null });
  });

  it('dejar vacío un dato que ya estaba vacío no es un cambio', () => {
    const empty = { ...BRANCH, address: null, phone: null };
    expect(buildBranchChanges(empty, formFromBranch(empty))).toEqual({});
  });

  it('llenar un dato que estaba vacío sí es un cambio', () => {
    const empty = { ...BRANCH, address: null };
    expect(buildBranchChanges(empty, { ...formFromBranch(empty), address: 'Nueva dirección' })).toEqual({ address: 'Nueva dirección' });
  });
});
