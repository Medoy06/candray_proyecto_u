// =============================================================================
// errorApi.prueba.ts
// Qué prueba:   que cada tipo de error de la API se convierte en un mensaje útil
//               en español, y que nunca se muestra texto técnico al usuario.
// =============================================================================
import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { getApiErrorMessage } from '../../src/utilidades/errorApi';

// Construye un error de axios con la respuesta indicada (o sin respuesta).
function axiosError(response?: { status: number; data: unknown }): AxiosError {
  const config = { headers: {} } as never;
  return new AxiosError(
    'Request failed',
    'ERR',
    config,
    {},
    response ? ({ ...response, statusText: '', headers: {}, config } as never) : undefined,
  );
}

describe('getApiErrorMessage', () => {
  it('muestra el mensaje que explica el servidor', () => {
    const error = axiosError({ status: 423, data: { success: false, message: 'La cuenta está bloqueada temporalmente.' } });
    expect(getApiErrorMessage(error)).toBe('La cuenta está bloqueada temporalmente.');
  });

  it('sin respuesta (servidor apagado) explica que no hay conexión', () => {
    expect(getApiErrorMessage(axiosError())).toContain('No se pudo conectar');
  });

  it.each([
    ['respuesta sin mensaje', { status: 500, data: {} }],
    ['respuesta que no es JSON', { status: 502, data: '<html>Bad gateway</html>' }],
    ['mensaje vacío', { status: 400, data: { message: '' } }],
    ['mensaje que no es texto', { status: 400, data: { message: { x: 1 } } }],
  ])('%s -> mensaje de reserva', (_name, response) => {
    expect(getApiErrorMessage(axiosError(response), 'Mensaje propio')).toBe('Mensaje propio');
  });

  it('un error que no es de axios usa el mensaje de reserva y NO filtra el texto técnico', () => {
    const message = getApiErrorMessage(new TypeError('Cannot read properties of undefined'));
    expect(message).not.toContain('Cannot read');
    expect(message).toContain('error inesperado');
  });
});
