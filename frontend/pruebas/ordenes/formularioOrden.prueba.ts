// =============================================================================
// formularioOrden.prueba.ts
// Qué prueba:   la lógica del formulario de una orden de óptica, sin pantalla:
//               la lectura de montos, cada regla de validación (con su mensaje)
//               y el armado de lo que se envía.
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  EMPTY_ORDER_FORM,
  buildOrderInput,
  parseAmount,
  validateOrderForm,
  type OrderFormValues,
} from '../../src/paginas/ordenes/formularioOrden';

const VALID: OrderFormValues = { frame: 'Armazón negro', lenses: 'Antirreflejo', total: '120', deposit: '40', notes: '' };
const check = (changes: Partial<OrderFormValues>) => validateOrderForm({ ...VALID, ...changes });

describe('parseAmount', () => {
  it.each([
    ['120', 120], ['12.5', 12.5], ['12,50', 12.5], ['  7 ', 7], ['.5', 0.5], ['10.', 10], ['0', 0], ['99999.99', 99999.99],
  ])('lee "%s" como %s', (text, expected) => {
    expect(parseAmount(text)).toBe(expected);
  });

  it.each(['', '   '])('un campo vacío (%j) es null', (text) => {
    expect(parseAmount(text)).toBeNull();
  });

  it.each(['abc', '1.234', '-5', '1e3', '12.5.1', '$10', '1,2,3', '--'])('"%s" no es un monto válido (NaN)', (text) => {
    expect(parseAmount(text)).toBeNaN();
  });
});

describe('validateOrderForm', () => {
  it('un formulario completo es válido; el anticipo y las notas son opcionales', () => {
    expect(check({})).toBe('');
    expect(check({ deposit: '', notes: '' })).toBe('');
    expect(check({ deposit: '0' })).toBe('');
  });

  it('el armazón y los lentes son obligatorios y tienen tope', () => {
    expect(check({ frame: '   ' })).toBe('Indique el armazón.');
    expect(check({ frame: 'a'.repeat(201) })).toBe('El armazón admite hasta 200 caracteres.');
    expect(check({ frame: 'a'.repeat(200) })).toBe('');
    expect(check({ lenses: '' })).toBe('Indique los lentes.');
    expect(check({ lenses: 'a'.repeat(201) })).toBe('Los lentes admiten hasta 200 caracteres.');
    expect(check({ lenses: 'a'.repeat(200) })).toBe('');
  });

  it('el total es obligatorio, positivo, con a lo más dos decimales y tiene tope', () => {
    expect(check({ total: '' })).toBe('Indique el total de la orden.');
    expect(check({ total: 'mucho' })).toBe('El total debe ser un monto en dólares, con a lo más dos decimales.');
    expect(check({ total: '10.005' })).toBe('El total debe ser un monto en dólares, con a lo más dos decimales.');
    expect(check({ total: '0', deposit: '' })).toBe('El total debe ser mayor que cero.');
    expect(check({ total: '0.00', deposit: '' })).toBe('El total debe ser mayor que cero.');
    expect(check({ total: '0.01', deposit: '' })).toBe('');
    expect(check({ total: '99999.99', deposit: '' })).toBe('');
    expect(check({ total: '100000', deposit: '' })).toBe('El total no puede pasar de 99999.99.');
  });

  it('el anticipo debe ser un monto válido y no pasar del total', () => {
    expect(check({ deposit: 'x' })).toBe('El anticipo debe ser un monto en dólares, con a lo más dos decimales.');
    expect(check({ deposit: '1.234' })).toBe('El anticipo debe ser un monto en dólares, con a lo más dos decimales.');
    expect(check({ deposit: '120.01' })).toBe('El anticipo no puede pasar del total.');
    expect(check({ deposit: '120' })).toBe('');
    expect(check({ total: '0.30', deposit: '0.10' })).toBe('');
  });

  it('compara en centavos: 0.1 + 0.2 no se cuela como 0.30000000000000004', () => {
    expect(check({ total: '0.3', deposit: '0.30' })).toBe('');
    expect(check({ total: '1.1', deposit: '1.10' })).toBe('');
    expect(check({ total: '19.99', deposit: '19.99' })).toBe('');
    expect(check({ total: '19.99', deposit: '20' })).toBe('El anticipo no puede pasar del total.');
  });

  it('las notas tienen tope', () => {
    expect(check({ notes: 'a'.repeat(500) })).toBe('');
    expect(check({ notes: 'a'.repeat(501) })).toBe('Las notas admiten hasta 500 caracteres.');
  });

  it('devuelve el primer problema en el orden del formulario', () => {
    expect(validateOrderForm(EMPTY_ORDER_FORM)).toBe('Indique el armazón.');
    expect(check({ lenses: '', total: '' })).toBe('Indique los lentes.');
    expect(check({ total: '', deposit: 'x' })).toBe('Indique el total de la orden.');
  });
});

describe('buildOrderInput', () => {
  it('arma el cuerpo con números, sin espacios sobrantes y con la receta elegida', () => {
    expect(buildOrderInput('r1', { frame: '  Armazón  ', lenses: ' Lentes ', total: '120,50', deposit: '40', notes: '  urgente ' })).toEqual({
      prescription_id: 'r1', frame_description: 'Armazón', lens_description: 'Lentes',
      total_amount: 120.5, deposit_amount: 40, notes: 'urgente',
    });
  });

  it('un anticipo vacío es 0 y unas notas en blanco son null', () => {
    expect(buildOrderInput('r1', { ...VALID, deposit: '', notes: '   ' })).toMatchObject({ deposit_amount: 0, notes: null });
  });
});
