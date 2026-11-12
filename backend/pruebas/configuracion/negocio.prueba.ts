// =============================================================================
// negocio.prueba.ts
// Qué prueba:   las constantes de negocio acordadas (IVA, bloqueo de cuenta) y
//               el formato del DUI (########-#).
// Depende de:   configuracion/negocio.ts.
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_LOCK_MINUTES,
  CURRENCY,
  DUI_PATTERN,
  MAX_FAILED_LOGIN_ATTEMPTS,
  VAT_PERCENT,
} from '../../src/configuracion/negocio';

describe('constantes acordadas', () => {
  it('IVA de 13 %, moneda USD', () => {
    expect(VAT_PERCENT).toBe(13);
    expect(CURRENCY).toBe('USD');
  });

  it('el bloqueo de cuenta es de 5 intentos y 15 minutos', () => {
    expect(MAX_FAILED_LOGIN_ATTEMPTS).toBe(5);
    expect(ACCOUNT_LOCK_MINUTES).toBe(15);
  });
});

describe('formato del DUI', () => {
  it.each(['01234567-8', '00000000-0', '99999999-9'])('acepta %s', (dui) => {
    expect(DUI_PATTERN.test(dui)).toBe(true);
  });

  it.each([
    ['sin guion', '012345678'],
    ['solo 7 dígitos antes del guion', '1234567-8'],
    ['9 dígitos antes del guion', '012345678-9'],
    ['2 dígitos después del guion', '01234567-89'],
    ['con letras', '0123456A-8'],
    ['con espacios', ' 01234567-8'],
    ['vacío', ''],
  ])('rechaza: %s', (_motivo, dui) => {
    expect(DUI_PATTERN.test(dui)).toBe(false);
  });
});
