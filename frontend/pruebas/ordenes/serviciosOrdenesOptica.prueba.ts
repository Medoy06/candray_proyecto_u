// =============================================================================
// serviciosOrdenesOptica.prueba.ts
// Qué prueba:   que las llamadas de servicios/ordenesOptica.ts envíen al servidor
//               la ruta, el método, los parámetros y el cuerpo correctos, que
//               devuelvan lo que corresponde y que no exista ninguna llamada
//               para editar o borrar una orden.
// =============================================================================
import { describe, expect, it } from 'vitest';
import * as servicio from '../../src/servicios/ordenesOptica';
import { installFakeApi } from '../ayudas/apiFalsa';

const PAGINATION = { page: 1, page_size: 25, total: 1, total_pages: 1 };
const INPUT = {
  prescription_id: 'r1', frame_description: 'Armazón', lens_description: 'Lentes', total_amount: 120, deposit_amount: 40, notes: null,
};

describe('listOpticalOrders', () => {
  it('pide la sucursal y la página, sin estado si no se eligió', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [], pagination: PAGINATION } }));
    await servicio.listOpticalOrders({ branchId: 'b1', status: '' }, 2);
    expect(received[0]).toMatchObject({ method: 'get', url: '/ordenes-optica' });
    expect(received[0].params).toEqual({ branch_id: 'b1', page: 2, page_size: servicio.OPTICAL_ORDER_PAGE_SIZE });
    expect(received[0].params).not.toHaveProperty('status');
  });

  it('con un estado elegido lo envía', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [], pagination: PAGINATION } }));
    await servicio.listOpticalOrders({ branchId: 'b1', status: 'in_lab' }, 1);
    expect(received[0].params).toMatchObject({ status: 'in_lab' });
  });

  it('devuelve las filas y la paginación', async () => {
    installFakeApi(() => ({ status: 200, data: { data: [{ id: 'o1' }], pagination: PAGINATION } }));
    expect(await servicio.listOpticalOrders({ branchId: 'b1', status: '' }, 1)).toEqual({ rows: [{ id: 'o1' }], pagination: PAGINATION });
  });
});

describe('getOpticalOrder', () => {
  it('pide GET /ordenes-optica/:id y devuelve la orden con su historia', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: { id: 'o1', events: [] } } }));
    expect(await servicio.getOpticalOrder('o1')).toEqual({ id: 'o1', events: [] });
    expect(received).toMatchObject([{ method: 'get', url: '/ordenes-optica/o1' }]);
  });
});

describe('createOpticalOrder', () => {
  it('hace POST /ordenes-optica con el cuerpo tal cual y devuelve la orden creada', async () => {
    const received = installFakeApi(() => ({ status: 201, data: { data: { id: 'o2' } } }));
    expect(await servicio.createOpticalOrder(INPUT)).toEqual({ id: 'o2' });
    expect(received).toMatchObject([{ method: 'post', url: '/ordenes-optica', body: INPUT }]);
  });
});

describe('changeOpticalOrderStatus', () => {
  it('avanzar envía solo el estado', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: { id: 'o1', status: 'in_lab' } } }));
    expect(await servicio.changeOpticalOrderStatus('o1', 'in_lab')).toEqual({ id: 'o1', status: 'in_lab' });
    expect(received).toMatchObject([{ method: 'post', url: '/ordenes-optica/o1/estado', body: { status: 'in_lab' } }]);
    expect(received[0].body).not.toHaveProperty('reason');
  });

  it('cancelar envía el motivo', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: { id: 'o1' } } }));
    await servicio.changeOpticalOrderStatus('o1', 'cancelled', 'Cambió de opinión');
    expect(received[0].body).toEqual({ status: 'cancelled', reason: 'Cambió de opinión' });
  });

  it('un motivo que sobra al avanzar no se envía', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: { id: 'o1' } } }));
    await servicio.changeOpticalOrderStatus('o1', 'ready', 'sobra');
    expect(received[0].body).toEqual({ status: 'ready' });
  });
});

describe('servicios/ordenesOptica', () => {
  it('no hay llamadas para editar ni borrar una orden', () => {
    const functions = Object.entries(servicio).filter(([, value]) => typeof value === 'function').map(([name]) => name);
    expect(functions.sort()).toEqual(['changeOpticalOrderStatus', 'createOpticalOrder', 'getOpticalOrder', 'listOpticalOrders']);
  });
});
