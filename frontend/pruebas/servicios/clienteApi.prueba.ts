// =============================================================================
// clienteApi.prueba.ts
// Qué prueba:   que cada petición lleva el token y la sucursal activa, y que un
//               401 (sesión vencida) avisa para cerrar la sesión, salvo en el
//               propio inicio de sesión.
// =============================================================================
import { describe, expect, it, vi } from 'vitest';
import { api, onUnauthorized } from '../../src/servicios/clienteApi';
import { storeBranchId, storeToken } from '../../src/servicios/almacenSesion';
import { installFakeApi } from '../ayudas/apiFalsa';

describe('Cabeceras de cada petición', () => {
  it('agrega el token y la sucursal activa', async () => {
    storeToken('abc123');
    storeBranchId('sucursal-1');
    const received = installFakeApi(() => ({ status: 200 }));
    await api.get('/cualquier-cosa');
    expect(received[0].headers['authorization']).toBe('Bearer abc123');
    expect(received[0].headers['x-sucursal-id']).toBe('sucursal-1');
  });

  it('sin sesión guardada no agrega ninguna de las dos', async () => {
    const received = installFakeApi(() => ({ status: 200 }));
    await api.get('/cualquier-cosa');
    expect(received[0].headers['authorization']).toBeUndefined();
    expect(received[0].headers['x-sucursal-id']).toBeUndefined();
  });
});

describe('Respuesta 401', () => {
  it('en una petición normal avisa para cerrar la sesión', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    installFakeApi(() => ({ status: 401, data: { message: 'Token inválido o expirado.' } }));
    await expect(api.get('/usuarios')).rejects.toBeTruthy();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('en el inicio de sesión NO cierra nada (son credenciales incorrectas)', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    installFakeApi(() => ({ status: 401, data: { message: 'Credenciales incorrectas.' } }));
    await expect(api.post('/auth/login', {})).rejects.toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([400, 403, 404, 409, 423, 500])('un %i NO cierra la sesión', async (status) => {
    const handler = vi.fn();
    onUnauthorized(handler);
    installFakeApi(() => ({ status }));
    await expect(api.get('/usuarios')).rejects.toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
  });

  it('el error original le llega a quien hizo la llamada', async () => {
    installFakeApi(() => ({ status: 409, data: { message: 'Ya existe un usuario con ese correo.' } }));
    await expect(api.post('/usuarios', {})).rejects.toMatchObject({ response: { status: 409 } });
  });
});
