// =============================================================================
// formularioInterconsulta.prueba.ts
// Qué prueba:   la validación y el armado del cuerpo del formulario de
//               interconsulta (médico, motivo y días), con los límites del servidor.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { REFERRAL_DEFAULT_DAYS, REFERRAL_MAX_DAYS } from '../../src/configuracion/negocio';
import {
  buildGrantInput,
  EMPTY_REFERRAL_FORM,
  REASON_MAX_LENGTH,
  validateReferralForm,
  type ReferralFormValues,
} from '../../src/paginas/expediente/formularioInterconsulta';

const valid: ReferralFormValues = { providerId: 'd1', reason: 'Segunda opinión', days: '7' };

describe('valores de partida y límites', () => {
  it('arranca con la duración por defecto y los máximos del servidor', () => {
    expect(EMPTY_REFERRAL_FORM).toEqual({ providerId: '', reason: '', days: '14' });
    expect(REFERRAL_DEFAULT_DAYS).toBe(14);
    expect(REFERRAL_MAX_DAYS).toBe(30);
    expect(REASON_MAX_LENGTH).toBe(500);
  });
});

describe('validateReferralForm', () => {
  it('un formulario correcto no tiene problemas', () => {
    expect(validateReferralForm(valid)).toBe('');
  });

  it('hay que elegir al médico', () => {
    expect(validateReferralForm({ ...valid, providerId: '' })).toBe('Elija el médico que recibirá el acceso.');
  });

  it('el motivo pide al menos 3 caracteres (sin contar espacios de los lados) y como máximo 500', () => {
    expect(validateReferralForm({ ...valid, reason: 'ab' })).toBe('Indique el motivo (mínimo 3 caracteres).');
    expect(validateReferralForm({ ...valid, reason: '   ab   ' })).toBe('Indique el motivo (mínimo 3 caracteres).');
    expect(validateReferralForm({ ...valid, reason: 'abc' })).toBe('');
    expect(validateReferralForm({ ...valid, reason: 'x'.repeat(500) })).toBe('');
    expect(validateReferralForm({ ...valid, reason: 'x'.repeat(501) })).toBe('El motivo no puede pasar de 500 caracteres.');
  });

  it.each(['', '  ', 'abc', '2.5'])('los días "%s" no son un número entero', (days) => {
    expect(validateReferralForm({ ...valid, days })).toBe('Los días deben ser un número entero.');
  });

  it('los días van de 1 a 30', () => {
    const message = 'El acceso dura entre 1 y 30 días.';
    expect(validateReferralForm({ ...valid, days: '0' })).toBe(message);
    expect(validateReferralForm({ ...valid, days: '31' })).toBe(message);
    expect(validateReferralForm({ ...valid, days: '1' })).toBe('');
    expect(validateReferralForm({ ...valid, days: '30' })).toBe('');
  });
});

describe('buildGrantInput', () => {
  it('recorta el motivo y envía los días como número', () => {
    expect(buildGrantInput({ providerId: 'd1', reason: '  Segunda opinión ', days: '7' })).toEqual({
      provider_id: 'd1', reason: 'Segunda opinión', days: 7,
    });
  });
});
