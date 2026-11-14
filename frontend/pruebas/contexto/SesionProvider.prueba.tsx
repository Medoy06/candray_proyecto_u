// =============================================================================
// SesionProvider.prueba.tsx
// Qué prueba:   el comportamiento de la sesión: recuperarla al abrir la página,
//               iniciar y cerrar sesión, cambiar de sucursal (con su color),
//               y cerrar sola si el servidor dice 401.
// Cómo:         usa el cliente real con una API falsa (ayudas/apiFalsa.ts).
// =============================================================================
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SesionProvider } from '../../src/contexto/SesionProvider';
import { useSesion } from '../../src/ganchos/useSesion';
import { getStoredBranchId, getStoredToken, storeBranchId, storeToken } from '../../src/servicios/almacenSesion';
import { api } from '../../src/servicios/clienteApi';
import { installFakeApi } from '../ayudas/apiFalsa';
import { CENTRAL, ESCALON, LOGIN, SESSION } from '../ayudas/datosSesion';

// Componente de prueba que expone la sesión en pantalla y en una variable.
let current: ReturnType<typeof useSesion>;
function Sonda() {
  current = useSesion();
  return (
    <p>
      estado:{current.status} sucursal:{current.activeBranch?.code ?? 'ninguna'} usuario:
      {current.user?.full_name ?? 'nadie'}
    </p>
  );
}
const mount = () => render(<SesionProvider><Sonda /></SesionProvider>);
const accent = () => document.documentElement.style.getPropertyValue('--acento');
const ok = (data: unknown) => ({ status: 200, data: { success: true, data } });

describe('Al abrir la página', () => {
  it('sin token guardado: no hay sesión y no se llama al servidor', async () => {
    const received = installFakeApi(() => ok(SESSION));
    mount();
    expect(screen.getByText(/estado:anonymous/)).toBeInTheDocument();
    expect(received).toHaveLength(0);
  });

  it('con token válido: recupera usuario, sucursal y color desde el servidor', async () => {
    storeToken('t');
    installFakeApi(() => ok(SESSION));
    mount();
    expect(screen.getByText(/estado:loading/)).toBeInTheDocument(); // mientras comprueba
    await screen.findByText(/estado:authenticated sucursal:CENTRAL usuario:Dr. Alejandro Mejía/);
    expect(accent()).toBe('#0F766E');
    expect(current.can('medical_records_read')).toBe(true);
    expect(current.can('users_manage')).toBe(false);
  });

  it('con token rechazado (401): cierra la sesión y borra el token', async () => {
    storeToken('vencido');
    installFakeApi(() => ({ status: 401, data: { message: 'Token inválido o expirado.' } }));
    mount();
    await screen.findByText(/estado:anonymous/);
    expect(getStoredToken()).toBeNull();
  });

  it('con el servidor caído: muestra el login pero conserva el token', async () => {
    storeToken('t');
    installFakeApi(() => {
      throw new Error('sin red');
    });
    mount();
    await screen.findByText(/estado:anonymous/);
    expect(getStoredToken()).toBe('t');
  });

  it('recuerda la última sucursal elegida', async () => {
    storeToken('t');
    storeBranchId(ESCALON.id);
    installFakeApi(() => ok({ ...SESSION, activeBranchId: ESCALON.id }));
    mount();
    await screen.findByText(/sucursal:ESCALON/);
    expect(accent()).toBe('#1D4ED8');
  });

  it('si la sucursal guardada ya no le corresponde (403), usa la predeterminada', async () => {
    storeToken('t');
    storeBranchId('sucursal-que-le-quitaron');
    const received = installFakeApi((request) =>
      request.headers['x-sucursal-id'] === 'sucursal-que-le-quitaron'
        ? { status: 403, data: { message: 'No tiene acceso a esa sucursal.' } }
        : ok(SESSION),
    );
    mount();
    await screen.findByText(/estado:authenticated sucursal:CENTRAL/);
    expect(received).toHaveLength(2); // el intento fallido y el reintento
    expect(getStoredBranchId()).toBe(CENTRAL.id);
  });
});

describe('Iniciar sesión', () => {
  it('guarda el token, entra a la sucursal predeterminada y aplica su color', async () => {
    const received = installFakeApi(() => ok(LOGIN));
    mount();
    await act(() => current.login('dr.mejia@candray.test', 'clave'));
    expect(screen.getByText(/estado:authenticated sucursal:CENTRAL/)).toBeInTheDocument();
    expect(getStoredToken()).toBe('token-de-prueba');
    expect(received[0].body).toEqual({ email: 'dr.mejia@candray.test', password: 'clave' });
    expect(accent()).toBe('#0F766E');
  });

  it('con credenciales incorrectas lanza el error y NO deja sesión ni token', async () => {
    installFakeApi(() => ({ status: 401, data: { message: 'Credenciales incorrectas.' } }));
    mount();
    await expect(act(() => current.login('a@b.test', 'mala'))).rejects.toMatchObject({ response: { status: 401 } });
    expect(screen.getByText(/estado:anonymous/)).toBeInTheDocument();
    expect(getStoredToken()).toBeNull();
  });

  it('una sucursal guardada por OTRA persona que no le corresponde se ignora', async () => {
    storeBranchId('sucursal-de-otra-persona');
    installFakeApi(() => ok(LOGIN));
    mount();
    await act(() => current.login('dr.mejia@candray.test', 'clave'));
    expect(getStoredBranchId()).toBe(CENTRAL.id);
  });
});

describe('Cambiar de sucursal', () => {
  async function loggedIn() {
    installFakeApi(() => ok(LOGIN));
    mount();
    await act(() => current.login('dr.mejia@candray.test', 'clave'));
  }

  it('cambia la sucursal activa, su color y lo recuerda', async () => {
    await loggedIn();
    act(() => current.selectBranch(ESCALON.id));
    expect(screen.getByText(/sucursal:ESCALON/)).toBeInTheDocument();
    expect(accent()).toBe('#1D4ED8');
    expect(getStoredBranchId()).toBe(ESCALON.id);
  });

  it('una sucursal que no le corresponde se ignora por completo', async () => {
    await loggedIn();
    act(() => current.selectBranch('otra-sucursal'));
    expect(screen.getByText(/sucursal:CENTRAL/)).toBeInTheDocument();
    expect(accent()).toBe('#0F766E');
    expect(getStoredBranchId()).toBe(CENTRAL.id);
  });
});

describe('Cerrar sesión', () => {
  it('olvida token, sucursal y color', async () => {
    installFakeApi(() => ok(LOGIN));
    mount();
    await act(() => current.login('dr.mejia@candray.test', 'clave'));
    act(() => current.logout());
    expect(screen.getByText(/estado:anonymous sucursal:ninguna usuario:nadie/)).toBeInTheDocument();
    expect(getStoredToken()).toBeNull();
    expect(getStoredBranchId()).toBeNull();
    expect(accent()).toBe('#0f766e'); // color de partida
  });

  it('se cierra sola si cualquier petición posterior responde 401', async () => {
    let expired = false;
    installFakeApi((request) =>
      expired && request.url !== '/auth/login' ? { status: 401, data: {} } : ok(LOGIN),
    );
    mount();
    await act(() => current.login('dr.mejia@candray.test', 'clave'));
    expired = true;
    await act(async () => {
      await api.get('/usuarios').catch(() => undefined);
    });
    await waitFor(() => expect(screen.getByText(/estado:anonymous/)).toBeInTheDocument());
    expect(getStoredToken()).toBeNull();
  });
});
