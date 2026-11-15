// =============================================================================
// serviciosSucursales.prueba.ts
// Qué prueba:   que createBranch y updateBranch envíen al servidor la ruta, el
//               método y el cuerpo correctos.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { createBranch, updateBranch } from '../../src/servicios/sucursales';
import { installFakeApi } from '../ayudas/apiFalsa';

describe('servicios de sucursales', () => {
  it('createBranch hace POST a /sucursales con el cuerpo y devuelve la sucursal', async () => {
    const received = installFakeApi(() => ({ status: 201, data: { data: { id: 'n1' } } }));
    const input = {
      code: 'NUEVA', name: 'Nueva', address: null, phone: null, opening_time: '08:00',
      closing_time: '18:00', theme_color: '#003449', has_optical_counter: false,
    };
    expect(await createBranch(input)).toEqual({ id: 'n1' });
    expect(received[0]).toMatchObject({ method: 'post', url: '/sucursales', body: input });
  });

  it('updateBranch hace PATCH a /sucursales/:id solo con lo enviado', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: { id: 'b9' } } }));
    await updateBranch('b9', { is_active: false });
    expect(received[0]).toMatchObject({ method: 'patch', url: '/sucursales/b9', body: { is_active: false } });
  });
});
