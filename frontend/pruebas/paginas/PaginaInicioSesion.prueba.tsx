// =============================================================================
// PaginaInicioSesion.prueba.tsx
// Qué prueba:   la pantalla de acceso: validación del formulario, mensajes de
//               error del servidor (incluido el bloqueo de cuenta), estado de
//               "enviando" y los atajos de las cuentas de demostración.
// Cómo:         usa el cliente real con una API falsa (ayudas/apiFalsa.ts).
// =============================================================================
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from '../../src/configuracion/demostracion';
import { SesionProvider } from '../../src/contexto/SesionProvider';
import { useSesion } from '../../src/ganchos/useSesion';
import { PaginaInicioSesion } from '../../src/paginas/autenticacion/PaginaInicioSesion';
import { getStoredToken } from '../../src/servicios/almacenSesion';
import { installFakeApi } from '../ayudas/apiFalsa';
import { LOGIN } from '../ayudas/datosSesion';

// Muestra el estado de la sesión para comprobar que el login la cambió.
function Estado() {
  return <p>sesion:{useSesion().status}</p>;
}
const mount = () =>
  render(
    <SesionProvider>
      <PaginaInicioSesion />
      <Estado />
    </SesionProvider>,
  );

const emailField = () => screen.getByLabelText('Correo electrónico');
const passwordField = () => screen.getByLabelText('Contraseña');
const submit = () => screen.getByRole('button', { name: /iniciar sesión/i });

describe('PaginaInicioSesion', () => {
  it('con los campos vacíos pide completarlos y NO llama al servidor', async () => {
    const received = installFakeApi(() => ({ status: 200 }));
    mount();
    await userEvent.click(submit());
    expect(screen.getByRole('alert')).toHaveTextContent('ingrese su correo y contraseña');
    expect(received).toHaveLength(0);
  });

  it('con datos correctos inicia sesión y guarda el token', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { success: true, data: LOGIN } }));
    mount();
    await userEvent.type(emailField(), '  dr.mejia@candray.test ');
    await userEvent.type(passwordField(), 'clave-correcta');
    await userEvent.click(submit());
    await screen.findByText('sesion:authenticated');
    expect(received[0].body).toEqual({ email: 'dr.mejia@candray.test', password: 'clave-correcta' }); // sin espacios
    expect(getStoredToken()).toBe('token-de-prueba');
  });

  it('Enter en el campo de contraseña también envía el formulario', async () => {
    installFakeApi(() => ({ status: 200, data: { success: true, data: LOGIN } }));
    mount();
    await userEvent.type(emailField(), 'a@candray.test');
    await userEvent.type(passwordField(), 'clave{Enter}');
    await screen.findByText('sesion:authenticated');
  });

  it.each([
    [401, 'Credenciales incorrectas.'],
    [423, 'La cuenta está bloqueada temporalmente. Intente de nuevo en 15 minutos.'],
    [403, 'El usuario no tiene sucursales asignadas. Contacte al administrador.'],
  ])('un %i muestra el mensaje del servidor y no inicia sesión', async (status, message) => {
    installFakeApi(() => ({ status, data: { success: false, message } }));
    mount();
    await userEvent.type(emailField(), 'a@candray.test');
    await userEvent.type(passwordField(), 'mala');
    await userEvent.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByText('sesion:anonymous')).toBeInTheDocument();
    expect(getStoredToken()).toBeNull();
    expect(submit()).toBeEnabled(); // puede volver a intentar
  });

  it('con el servidor apagado lo explica', async () => {
    installFakeApi(() => {
      throw new Error('sin red');
    });
    mount();
    await userEvent.type(emailField(), 'a@candray.test');
    await userEvent.type(passwordField(), 'clave');
    await userEvent.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo|error inesperado/);
  });

  it('mientras envía, el botón se desactiva (evita doble envío)', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const received = installFakeApi(async () => {
      await gate;
      return { status: 200, data: { success: true, data: LOGIN } };
    });
    mount();
    await userEvent.type(emailField(), 'a@candray.test');
    await userEvent.type(passwordField(), 'clave');
    await userEvent.click(submit());
    await waitFor(() => expect(screen.getByRole('button', { name: /iniciando sesión/i })).toBeDisabled());
    await userEvent.click(screen.getByRole('button', { name: /iniciando sesión/i }));
    expect(received).toHaveLength(1);
    release();
    await screen.findByText('sesion:authenticated');
  });

  it('el mensaje de error desaparece al reintentar', async () => {
    let attempt = 0;
    installFakeApi(() =>
      ++attempt === 1
        ? { status: 401, data: { message: 'Credenciales incorrectas.' } }
        : { status: 200, data: { success: true, data: LOGIN } },
    );
    mount();
    await userEvent.type(emailField(), 'a@candray.test');
    await userEvent.type(passwordField(), 'mala');
    await userEvent.click(submit());
    await screen.findByRole('alert');
    await userEvent.click(submit());
    await screen.findByText('sesion:authenticated');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('los atajos de demostración llenan correo y contraseña', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Recepción Central' }));
    expect(emailField()).toHaveValue('recepcion.central@candray.test');
    expect(passwordField()).toHaveValue(DEMO_PASSWORD);
  });

  it('el campo de contraseña oculta lo escrito', () => {
    mount();
    expect(passwordField()).toHaveAttribute('type', 'password');
  });
});
