// =============================================================================
// serviciosUsuarios.prueba.ts
// Qué prueba:   que las llamadas de servicios/usuarios.ts y sucursales.ts
//               envíen lo correcto: solo los filtros con valor, el estado como
//               texto, y el cuerpo de crear/editar.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { listBranches } from '../../src/servicios/sucursales';
import { createUser, listUsers, resetUserPassword, setUserBranches, unlockUser, updateUser } from '../../src/servicios/usuarios';
import { installFakeApi } from '../ayudas/apiFalsa';

describe('servicios de usuarios', () => {
  it('listUsers sin filtros no envía parámetros', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [] } }));
    await listUsers();
    expect(received[0]).toMatchObject({ method: 'get', url: '/usuarios', params: {} });
  });

  it('listUsers envía solo los filtros con valor y el estado como texto', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [] } }));
    await listUsers({ role: 'doctor', is_active: false, search: 'ana' });
    expect(received[0].params).toEqual({ role: 'doctor', is_active: 'false', search: 'ana' });
  });

  it('listUsers omite una búsqueda vacía', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [] } }));
    await listUsers({ search: '' });
    expect(received[0].params).toEqual({});
  });

  it('createUser hace POST con el cuerpo y devuelve el usuario', async () => {
    const received = installFakeApi(() => ({ status: 201, data: { data: { id: 'n1' } } }));
    const input = { full_name: 'Ana', email: 'a@b.co', password: '12345678', role: 'admin' as const, branch_ids: [] };
    const created = await createUser(input);
    expect(received[0]).toMatchObject({ method: 'post', url: '/usuarios', body: input });
    expect(created).toEqual({ id: 'n1' });
  });

  it('updateUser hace PATCH a /usuarios/:id solo con lo enviado', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: { id: 'u9' } } }));
    await updateUser('u9', { is_active: false });
    expect(received[0]).toMatchObject({ method: 'patch', url: '/usuarios/u9', body: { is_active: false } });
  });

  it('setUserBranches hace PUT a /usuarios/:id/sucursales con la lista completa', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: { id: 'u9' } } }));
    await setUserBranches('u9', { branch_ids: ['a', 'b'], default_branch_id: 'b' });
    expect(received[0]).toMatchObject({
      method: 'put',
      url: '/usuarios/u9/sucursales',
      body: { branch_ids: ['a', 'b'], default_branch_id: 'b' },
    });
  });

  it('unlockUser hace POST a /usuarios/:id/desbloquear y devuelve el usuario', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: { id: 'u9', is_locked: false } } }));
    expect(await unlockUser('u9')).toEqual({ id: 'u9', is_locked: false });
    expect(received[0]).toMatchObject({ method: 'post', url: '/usuarios/u9/desbloquear' });
  });

  it('resetUserPassword hace PUT a /usuarios/:id/contrasena con solo la contraseña', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { success: true } }));
    await resetUserPassword('u9', 'clave-nueva-1');
    expect(received[0]).toMatchObject({ method: 'put', url: '/usuarios/u9/contrasena', body: { password: 'clave-nueva-1' } });
  });

  it('listBranches pide /sucursales', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [{ id: 's1' }] } }));
    expect(await listBranches()).toEqual([{ id: 's1' }]);
    expect(received[0]).toMatchObject({ method: 'get', url: '/sucursales' });
  });
});
