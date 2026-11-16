// =============================================================================
// PaginaOrdenesOptica.prueba.tsx
// Qué prueba:   la pantalla de órdenes de óptica: la lista y su filtro, quién ve
//               qué botones, el detalle (pedido, dinero, receta e historia),
//               avanzar una orden con confirmación, cancelarla con motivo y
//               crear una orden nueva (paciente, receta, validación y errores).
// Cómo:         la página con el cliente real + ayudas/apiFalsa.ts, dentro de
//               una sesión de ayudas/conSesion.tsx.
// =============================================================================
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Capability } from '../../src/configuracion/capacidades';
import { PaginaOrdenesOptica } from '../../src/paginas/ordenes/PaginaOrdenesOptica';
import type { Patient } from '../../src/servicios/pacientes';
import type { OpticalOrder, OpticalOrderDetail, OpticalOrderStatus } from '../../src/servicios/ordenesOptica';
import type { OpticalPrescription } from '../../src/servicios/recetas';
import { installFakeApi, type RecordedRequest } from '../ayudas/apiFalsa';
import { renderConSesion } from '../ayudas/conSesion';
import { CENTRAL } from '../ayudas/datosSesion';

const ANA: Patient = {
  id: 'p1', record_number: 101, full_name: 'Ana Pérez', birth_date: '1990-05-20', phone: '7000-1111',
  dui: null, email: null, is_active: true, created_at: '', updated_at: '',
};
const ANDREA: Patient = { ...ANA, id: 'p2', record_number: 102, full_name: 'Andrea Cruz', phone: '7222-3333' };

const ORDER: OpticalOrder = {
  id: 'o1', patient_id: 'p1', patient_name: 'Ana Pérez', patient_record_number: 101,
  prescription_id: 'r1', prescription_created_at: '2026-10-01 10:00:00', prescription_is_current: true,
  branch_id: CENTRAL.id, branch_name: 'Candray Central', created_by: 'u1', created_by_name: 'Marta López',
  frame_description: 'Armazón metálico negro', lens_description: 'Lentes con antirreflejo',
  total_amount: 120, deposit_amount: 40, balance: 80, notes: 'Entrega urgente',
  status: 'pending', cancellation_reason: null, created_at: '2026-10-05 09:30:00', updated_at: '2026-10-05 09:30:00',
};
const withStatus = (order: OpticalOrder, status: OpticalOrderStatus, extra: Partial<OpticalOrder> = {}): OpticalOrder => ({ ...order, status, ...extra });

const detailOf = (order: OpticalOrder): OpticalOrderDetail => ({
  ...order,
  events: [
    { id: 'e1', from_status: null, to_status: 'pending', changed_by: 'u1', changed_by_name: 'Marta López', created_at: '2026-10-05 09:30:00' },
    ...(order.status === 'pending'
      ? []
      : [{ id: 'e2', from_status: 'pending' as const, to_status: order.status, changed_by: 'u2', changed_by_name: 'Luis Ramos', created_at: '2026-10-06 11:00:00' }]),
  ],
});

const RX: OpticalPrescription = {
  id: 'r1', created_at: '2026-10-01 10:00:00', doctor_name: 'Dra. Rivas', is_current: true,
  od_sphere: -2.25, od_cylinder: -0.75, od_axis: 90, od_addition: 1.5, oi_sphere: 0, oi_cylinder: null, oi_axis: null, oi_addition: null,
  pupillary_distance: 62.5, lens_notes: 'Antirreflejo',
};
const RX_OLD: OpticalPrescription = { ...RX, id: 'r0', created_at: '2026-08-01 10:00:00', is_current: false, od_sphere: -2 };
const RX_SECOND: OpticalPrescription = { ...RX, id: 'r2', created_at: '2026-10-20 10:00:00', doctor_name: 'Dr. Mejía', od_sphere: -3 };

const PAGINATION = (total: number, page = 1, pages = 1) => ({ page, page_size: 25, total, total_pages: pages });

type Reply = { status: number; data?: unknown } | undefined;
function server(options: {
  orders?: OpticalOrder[];
  prescriptions?: OpticalPrescription[];
  override?: (request: RecordedRequest) => Reply | Promise<Reply>;
} = {}) {
  const { orders = [ORDER], prescriptions = [RX], override = () => undefined } = options;
  return installFakeApi(async (request) => {
    const custom = await override(request);
    if (custom !== undefined) return custom;
    if (request.method === 'get' && request.url === '/ordenes-optica') {
      const wanted = request.params?.status as string | undefined;
      const rows = wanted === undefined ? orders : orders.filter((order) => order.status === wanted);
      return { status: 200, data: { data: rows, pagination: PAGINATION(rows.length) } };
    }
    const one = request.url.match(/^\/ordenes-optica\/([^/]+)$/);
    if (request.method === 'get' && one) {
      const found = orders.find((order) => order.id === one[1]);
      return found ? { status: 200, data: { data: detailOf(found) } } : { status: 404 };
    }
    if (request.method === 'post' && request.url === '/ordenes-optica') return { status: 201, data: { data: detailOf(ORDER) } };
    if (request.method === 'post' && request.url.endsWith('/estado')) return { status: 200, data: { data: detailOf(ORDER) } };
    if (request.method === 'get' && request.url === '/pacientes') return { status: 200, data: { data: [ANA, ANDREA], pagination: PAGINATION(2) } };
    if (request.method === 'get' && request.url.endsWith('/recetas')) return { status: 200, data: { data: prescriptions, access: 'consent' } };
    return { status: 404 };
  });
}

const READ: Capability[] = ['optical_orders_read'];
const MANAGE: Capability[] = ['optical_orders_read', 'optical_orders_manage', 'prescriptions_read', 'patients_search'];

function mount(capabilities: Capability[] = MANAGE) {
  return renderConSesion(<PaginaOrdenesOptica />, { role: 'encargado_venta', capabilities });
}

const gets = (received: RecordedRequest[], url: string) => received.filter((r) => r.method === 'get' && r.url === url);
const posts = (received: RecordedRequest[]) => received.filter((r) => r.method === 'post');
const dlg = () => within(screen.getByRole('dialog'));
const alertDialog = () => within(screen.getByRole('alertdialog'));
// Abre el detalle de la orden de Ana y espera a que llegue su historia.
async function openDetail(user = userEvent.setup()) {
  await user.click(await screen.findByRole('button', { name: 'Ver la orden de Ana Pérez' }));
  await within(dlg().getByRole('region', { name: 'Historia de la orden' })).findAllByRole('listitem');
  return user;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('la lista', () => {
  it('muestra cada orden: fecha, paciente, pedido, total con saldo y estado', async () => {
    server();
    mount();
    const table = await screen.findByRole('table', { name: 'Órdenes de óptica' });
    const row = within(within(table).getAllByRole('row')[1]);
    expect(row.getByText('05/10/2026')).toBeInTheDocument();
    expect(row.getByText('Ana Pérez')).toBeInTheDocument();
    expect(row.getByText('Expediente 101')).toBeInTheDocument();
    expect(row.getByText('Armazón metálico negro')).toBeInTheDocument();
    expect(row.getByText('Lentes con antirreflejo')).toBeInTheDocument();
    expect(row.getByText('$120.00')).toBeInTheDocument();
    expect(row.getByText('Saldo $80.00')).toBeInTheDocument();
    expect(row.getByText('Pendiente')).toHaveClass('bg-aviso-fondo');
  });

  it('una orden sin saldo lo dice', async () => {
    server({ orders: [{ ...ORDER, deposit_amount: 120, balance: 0 }] });
    mount();
    expect(await screen.findByText('Sin saldo')).toBeInTheDocument();
    expect(screen.queryByText(/^Saldo/)).not.toBeInTheDocument();
  });

  it('pide las órdenes de la sucursal activa, página 1', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    expect(gets(received, '/ordenes-optica')[0].params).toEqual({ branch_id: CENTRAL.id, page: 1, page_size: 25 });
    expect(screen.getByText(/Ventas de lentes de Candray Central/)).toBeInTheDocument();
  });

  it.each([
    ['in_lab', 'En taller', 'bg-info-fondo'],
    ['ready', 'Lista', 'bg-info-fondo'],
    ['delivered', 'Entregada', 'bg-exito-fondo'],
    ['cancelled', 'Cancelada', 'bg-neutro-fondo'],
  ] as const)('el estado %s se ve como "%s"', async (status, label, tone) => {
    server({ orders: [withStatus(ORDER, status, status === 'cancelled' ? { cancellation_reason: 'Duplicada' } : {})] });
    mount();
    const table = await screen.findByRole('table', { name: 'Órdenes de óptica' });
    expect(within(table).getByText(label)).toHaveClass(tone);
  });

  it('el filtro de estado pide solo ese estado y vuelve a la página 1', async () => {
    const received = server({ orders: [ORDER, withStatus({ ...ORDER, id: 'o2', patient_name: 'Luis Gómez' }, 'ready')] });
    mount();
    await screen.findByText('Luis Gómez');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'ready');
    await waitFor(() => expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument());
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument();
    expect(gets(received, '/ordenes-optica').at(-1)?.params).toMatchObject({ status: 'ready', page: 1 });
  });

  it('el filtro ofrece "Todos" y los cinco estados en orden', async () => {
    server();
    mount();
    await screen.findByText('Ana Pérez');
    const options = within(screen.getByRole('combobox', { name: 'Estado' })).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Todos', 'Pendiente', 'En taller', 'Lista', 'Entregada', 'Cancelada']);
  });

  it('sin órdenes lo dice; con un filtro, lo dice distinto', async () => {
    server({ orders: [] });
    mount();
    expect(await screen.findByText('Todavía no hay órdenes en esta sucursal.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'ready');
    expect(await screen.findByText('No hay órdenes con ese estado.')).toBeInTheDocument();
  });

  it('mientras carga dice "Cargando órdenes..." y no el aviso de vacío', async () => {
    server();
    mount();
    expect(screen.getByText('Cargando órdenes...')).toBeInTheDocument();
    expect(screen.queryByText('Todavía no hay órdenes en esta sucursal.')).not.toBeInTheDocument();
    await screen.findByText('Ana Pérez');
  });

  it('si falla la carga muestra el error y deja reintentar', async () => {
    let fail = true;
    const received = server({ override: (request) => (fail && request.url === '/ordenes-optica' ? { status: 500, data: { message: 'Falla del servidor.' } } : undefined) });
    mount();
    expect(await screen.findByText('Falla del servidor.')).toBeInTheDocument();
    expect(screen.queryByText('Todavía no hay órdenes en esta sucursal.')).not.toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.queryByText('Falla del servidor.')).not.toBeInTheDocument();
    expect(gets(received, '/ordenes-optica')).toHaveLength(2);
  });

  it('con varias páginas resume y navega', async () => {
    const received = installFakeApi((request) => {
      if (request.url !== '/ordenes-optica') return { status: 404 };
      const page = Number(request.params?.page);
      return { status: 200, data: { data: [{ ...ORDER, id: `o${page}`, patient_name: page === 1 ? 'Ana Pérez' : 'Pedro Díaz' }], pagination: PAGINATION(26, page, 2) } };
    });
    mount();
    await screen.findByText('Ana Pérez');
    expect(screen.getByText(/26 órdenes/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(await screen.findByText('Pedro Díaz')).toBeInTheDocument();
    expect(gets(received, '/ordenes-optica').at(-1)?.params).toMatchObject({ page: 2 });
  });

  it('al cambiar el filtro estando en la página 2, vuelve a la página 1', async () => {
    const received = installFakeApi((request) => {
      if (request.url !== '/ordenes-optica') return { status: 404 };
      return { status: 200, data: { data: [ORDER], pagination: PAGINATION(26, Number(request.params?.page), 2) } };
    });
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    await waitFor(() => expect(gets(received, '/ordenes-optica').at(-1)?.params).toMatchObject({ page: 2 }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'ready');
    await waitFor(() => expect(gets(received, '/ordenes-optica').at(-1)?.params).toMatchObject({ status: 'ready', page: 1 }));
  });

  it('avisa si el médico reemplazó la receta de una orden que sigue abierta, pero no en las cerradas', async () => {
    server({
      orders: [
        { ...ORDER, prescription_is_current: false },
        withStatus({ ...ORDER, id: 'o2', patient_name: 'Luis Gómez', prescription_is_current: false }, 'delivered'),
        withStatus({ ...ORDER, id: 'o3', patient_name: 'Rosa Vega', prescription_is_current: false }, 'cancelled', { cancellation_reason: 'x' }),
      ],
    });
    mount();
    await screen.findByText('Luis Gómez');
    expect(screen.getAllByText('Receta reemplazada')).toHaveLength(1);
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Receta reemplazada')).toHaveClass('bg-aviso-fondo');
  });
});

describe('quién ve qué', () => {
  it('quien puede crear ve "Nueva orden"', async () => {
    server();
    mount();
    expect(await screen.findByRole('button', { name: 'Nueva orden' })).toBeInTheDocument();
  });

  it('quien solo puede leer no ve "Nueva orden" ni botones de cambio en el detalle', async () => {
    server();
    mount(READ);
    await screen.findByText('Ana Pérez');
    expect(screen.queryByRole('button', { name: 'Nueva orden' })).not.toBeInTheDocument();
    await openDetail();
    for (const name of ['Enviar al taller', 'Cancelar orden']) {
      expect(dlg().queryByRole('button', { name })).not.toBeInTheDocument();
    }
    // Solo cierra: la equis del encabezado y el botón del pie.
    expect(dlg().getAllByRole('button', { name: 'Cerrar' })).toHaveLength(2);
  });

  it('sin prescriptions_read no pide la receta ni muestra su sección', async () => {
    const received = server();
    mount(['optical_orders_read', 'optical_orders_manage']);
    await openDetail();
    expect(gets(received, '/pacientes/p1/recetas')).toHaveLength(0);
    expect(dlg().queryByRole('region', { name: 'Receta de la orden' })).not.toBeInTheDocument();
  });
});

describe('el detalle', () => {
  it('muestra el pedido, el dinero, quién la registró y las notas', async () => {
    server();
    mount();
    await openDetail();
    const detail = dlg();
    expect(detail.getByText('Ana Pérez · Expediente 101')).toBeInTheDocument();
    expect(detail.getByText('Candray Central')).toBeInTheDocument();
    expect(detail.getByText('Armazón metálico negro')).toBeInTheDocument();
    expect(detail.getByText('Lentes con antirreflejo')).toBeInTheDocument();
    expect(detail.getByText('$120.00')).toBeInTheDocument();
    expect(detail.getByText('$40.00')).toBeInTheDocument();
    expect(detail.getByText('$80.00')).toBeInTheDocument();
    expect(detail.getByText('Marta López, el 05/10/2026 09:30')).toBeInTheDocument();
    expect(detail.getByText('Entrega urgente')).toBeInTheDocument();
  });

  it('muestra las medidas de la receta para el taller', async () => {
    server();
    mount();
    await openDetail();
    const section = within(await dlg().findByRole('region', { name: 'Receta de la orden' }));
    expect(await section.findByText(/Emitida el 01\/10\/2026 10:00 por Dra. Rivas/)).toBeInTheDocument();
    const odRow = section.getByRole('row', { name: /Derecho/ });
    expect(within(odRow).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['-2.25', '-0.75', '90°', '+1.50']);
    expect(section.getByText('62.5 mm')).toBeInTheDocument();
    expect(section.getByText(/Antirreflejo/)).toBeInTheDocument();
  });

  it('muestra la historia de estados, de la creación al último cambio', async () => {
    server({ orders: [withStatus(ORDER, 'in_lab')] });
    mount();
    await openDetail();
    const items = within(dlg().getByRole('region', { name: 'Historia de la orden' })).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Creada · Marta López, 05/10/2026 09:30',
      'En taller · Luis Ramos, 06/10/2026 11:00',
    ]);
  });

  it('una orden cancelada muestra su motivo', async () => {
    server({ orders: [withStatus(ORDER, 'cancelled', { cancellation_reason: 'Cambió de opinión' })] });
    mount();
    await openDetail();
    expect(dlg().getByText('Cambió de opinión')).toBeInTheDocument();
    expect(dlg().getByText('Motivo de la cancelación')).toBeInTheDocument();
  });

  it('si el paciente retiró el consentimiento, muestra el aviso del servidor en vez de las medidas', async () => {
    server({
      override: (request) =>
        request.url === '/pacientes/p1/recetas'
          ? { status: 403, data: { message: 'El paciente no ha autorizado que la óptica vea su receta.' } }
          : undefined,
    });
    mount();
    await openDetail();
    expect(await dlg().findByText('El paciente no ha autorizado que la óptica vea su receta.')).toBeInTheDocument();
    expect(dlg().queryByRole('table', { name: 'Medidas de la receta' })).not.toBeInTheDocument();
    expect(dlg().getByText('Historia')).toBeInTheDocument(); // el resto de la orden sigue a la vista
  });

  it('si la receta fue reemplazada: avisa, no muestra las medidas viejas y lo explica', async () => {
    server({ orders: [{ ...ORDER, prescription_is_current: false }], prescriptions: [{ ...RX, id: 'r9' }] });
    mount();
    await openDetail();
    expect(await dlg().findByText(/El médico reemplazó la receta de esta orden/)).toBeInTheDocument();
    expect(await dlg().findByText('Esa receta ya no está vigente, por eso no se muestra.')).toBeInTheDocument();
    expect(dlg().queryByRole('table', { name: 'Medidas de la receta' })).not.toBeInTheDocument();
  });

  it('en una orden cerrada no se avisa del reemplazo de la receta', async () => {
    server({ orders: [withStatus({ ...ORDER, prescription_is_current: false }, 'delivered')] });
    mount();
    await openDetail();
    expect(dlg().queryByText(/El médico reemplazó la receta/)).not.toBeInTheDocument();
  });

  it('si la receta vigente no aparece en la lista, lo dice', async () => {
    server({ prescriptions: [] });
    mount();
    await openDetail();
    expect(await dlg().findByText('No se encontró la receta de esta orden.')).toBeInTheDocument();
  });

  it('si falla la carga del detalle muestra el error y no ofrece cambios', async () => {
    server({ override: (request) => (request.url === '/ordenes-optica/o1' ? { status: 500, data: { message: 'No se pudo.' } } : undefined) });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Ver la orden de Ana Pérez' }));
    expect(await dlg().findByText('No se pudo.')).toBeInTheDocument();
    expect(dlg().queryByRole('button', { name: 'Enviar al taller' })).not.toBeInTheDocument();
    expect(dlg().queryByRole('button', { name: 'Cancelar orden' })).not.toBeInTheDocument();
  });

  it('Cerrar cierra la ventana', async () => {
    server();
    mount();
    const user = await openDetail();
    await user.click(dlg().getAllByRole('button', { name: 'Cerrar' }).at(-1)!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['pending', 'Enviar al taller', true],
    ['in_lab', 'Marcar como lista', true],
    ['ready', 'Entregar al paciente', true],
    ['delivered', null, false],
    ['cancelled', null, false],
  ] as const)('una orden %s ofrece el paso "%s" y la cancelación según corresponda', async (status, step, cancellable) => {
    server({ orders: [withStatus(ORDER, status, status === 'cancelled' ? { cancellation_reason: 'x' } : {})] });
    mount();
    await openDetail();
    const steps = ['Enviar al taller', 'Marcar como lista', 'Entregar al paciente'];
    for (const name of steps) {
      if (name === step) expect(dlg().getByRole('button', { name })).toBeInTheDocument();
      else expect(dlg().queryByRole('button', { name })).not.toBeInTheDocument();
    }
    if (cancellable) expect(dlg().getByRole('button', { name: 'Cancelar orden' })).toBeInTheDocument();
    else expect(dlg().queryByRole('button', { name: 'Cancelar orden' })).not.toBeInTheDocument();
  });
});

describe('avanzar una orden', () => {
  it.each([
    ['pending', 'Enviar al taller', 'in_lab', 'En taller'],
    ['in_lab', 'Marcar como lista', 'ready', 'Lista'],
    ['ready', 'Entregar al paciente', 'delivered', 'Entregada'],
  ] as const)('desde %s: "%s" pide confirmar, envía el estado %s, avisa y recarga', async (status, button, next, label) => {
    const received = server({ orders: [withStatus(ORDER, status)] });
    mount();
    const user = await openDetail();
    await user.click(dlg().getByRole('button', { name: button }));

    // La ventana del detalle se cierra y aparece la confirmación.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(alertDialog().getByText(/Orden de Ana Pérez\./)).toBeInTheDocument();
    expect(alertDialog().getByText(/No se podrá deshacer\./)).toBeInTheDocument();
    expect(posts(received)).toHaveLength(0);
    const before = gets(received, '/ordenes-optica').length;

    await user.click(alertDialog().getByRole('button', { name: button }));
    expect(await screen.findByText(`La orden de Ana Pérez pasó a "${label}".`)).toBeInTheDocument();
    expect(posts(received)).toHaveLength(1);
    expect(posts(received)[0]).toMatchObject({ url: '/ordenes-optica/o1/estado', body: { status: next } });
    await waitFor(() => expect(gets(received, '/ordenes-optica').length).toBe(before + 1));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('si se vuelve atrás, no se envía nada', async () => {
    const received = server();
    mount();
    const user = await openDetail();
    await user.click(dlg().getByRole('button', { name: 'Enviar al taller' }));
    await user.click(alertDialog().getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(posts(received)).toHaveLength(0);
    expect(screen.queryByText(/pasó a/)).not.toBeInTheDocument();
  });

  it('si el servidor lo rechaza, muestra su mensaje y no avisa de éxito', async () => {
    server({
      override: (request) =>
        request.method === 'post' ? { status: 409, data: { message: 'Una orden en taller no puede pasar a en taller.' } } : undefined,
    });
    mount();
    const user = await openDetail();
    await user.click(dlg().getByRole('button', { name: 'Enviar al taller' }));
    await user.click(alertDialog().getByRole('button', { name: 'Enviar al taller' }));
    expect(await screen.findByText('Una orden en taller no puede pasar a en taller.')).toBeInTheDocument();
    expect(screen.queryByText(/pasó a/)).not.toBeInTheDocument();
  });

  it('un error genérico usa el texto de reserva', async () => {
    server({ override: (request) => (request.method === 'post' ? { status: 500 } : undefined) });
    mount();
    const user = await openDetail();
    await user.click(dlg().getByRole('button', { name: 'Enviar al taller' }));
    await user.click(alertDialog().getByRole('button', { name: 'Enviar al taller' }));
    expect(await screen.findByText('No se pudo cambiar el estado de la orden.')).toBeInTheDocument();
  });

  it('un aviso anterior desaparece al abrir otra orden', async () => {
    server();
    mount();
    const user = await openDetail();
    await user.click(dlg().getByRole('button', { name: 'Enviar al taller' }));
    await user.click(alertDialog().getByRole('button', { name: 'Enviar al taller' }));
    await screen.findByText(/pasó a/);
    await user.click(screen.getByRole('button', { name: 'Ver la orden de Ana Pérez' }));
    expect(screen.queryByText(/pasó a/)).not.toBeInTheDocument();
  });
});

describe('cancelar una orden', () => {
  async function openCancel() {
    const received = server();
    mount();
    const user = await openDetail();
    await user.click(dlg().getByRole('button', { name: 'Cancelar orden' }));
    return { received, user };
  }

  it('cierra el detalle y abre la ventana para cancelar, con el foco en el motivo', async () => {
    await openCancel();
    expect(dlg().getByText(/Orden de/)).toBeInTheDocument();
    expect(dlg().getByText(/Una orden cancelada no se puede reabrir\./)).toBeInTheDocument();
    expect(dlg().getByRole('textbox', { name: /Motivo de la cancelación/ })).toHaveFocus();
  });

  it('exige el motivo y no llama al servidor sin él', async () => {
    const { received, user } = await openCancel();
    await user.type(dlg().getByRole('textbox'), '   ');
    await user.click(dlg().getByRole('button', { name: 'Cancelar orden' }));
    expect(dlg().getByText('Indique el motivo de la cancelación.')).toBeInTheDocument();
    expect(posts(received)).toHaveLength(0);
  });

  it('cancela con el motivo sin espacios sobrantes, avisa y recarga', async () => {
    const { received, user } = await openCancel();
    const before = gets(received, '/ordenes-optica').length;
    await user.type(dlg().getByRole('textbox'), '  Cambió de opinión  ');
    await user.click(dlg().getByRole('button', { name: 'Cancelar orden' }));
    expect(await screen.findByText('Se canceló la orden de Ana Pérez.')).toBeInTheDocument();
    expect(posts(received)[0]).toMatchObject({ url: '/ordenes-optica/o1/estado', body: { status: 'cancelled', reason: 'Cambió de opinión' } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(gets(received, '/ordenes-optica').length).toBe(before + 1));
  });

  it('si el servidor lo rechaza muestra su mensaje y la ventana sigue abierta con lo escrito', async () => {
    server({ override: (request) => (request.method === 'post' ? { status: 409, data: { message: 'Una orden entregada no puede pasar a cancelada.' } } : undefined) });
    mount();
    const user = await openDetail();
    await user.click(dlg().getByRole('button', { name: 'Cancelar orden' }));
    await user.type(dlg().getByRole('textbox'), 'Tarde');
    await user.click(dlg().getByRole('button', { name: 'Cancelar orden' }));
    expect(await dlg().findByText('Una orden entregada no puede pasar a cancelada.')).toBeInTheDocument();
    expect(dlg().getByRole('textbox')).toHaveValue('Tarde');
    expect(dlg().getByRole('button', { name: 'Cancelar orden' })).toBeEnabled();
  });

  it('"Volver" cierra sin enviar nada', async () => {
    const { received, user } = await openCancel();
    await user.click(dlg().getByRole('button', { name: 'Volver' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(posts(received)).toHaveLength(0);
  });
});

describe('crear una orden', () => {
  async function openForm(options: Parameters<typeof server>[0] = {}) {
    const received = server(options);
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nueva orden' }));
    return { received, user };
  }
  async function pickPatient(user: ReturnType<typeof userEvent.setup>, search = 'Ana') {
    await user.type(dlg().getByRole('searchbox', { name: /Buscar paciente/ }), search);
    await user.click(await dlg().findByRole('button', { name: /Ana Pérez/ }));
  }
  async function fill(user: ReturnType<typeof userEvent.setup>, values: { frame?: string; lenses?: string; total?: string; deposit?: string; notes?: string }) {
    const { frame = 'Armazón negro', lenses = 'Antirreflejo', total = '120', deposit = '', notes = '' } = values;
    await user.type(dlg().getByRole('textbox', { name: /Armazón/ }), frame);
    await user.type(dlg().getByRole('textbox', { name: /Lentes/ }), lenses);
    await user.type(dlg().getByRole('textbox', { name: /Total/ }), total);
    if (deposit !== '') await user.type(dlg().getByRole('textbox', { name: /Anticipo/ }), deposit);
    if (notes !== '') await user.type(dlg().getByRole('textbox', { name: /Notas/ }), notes);
  }

  it('abre vacía: solo la búsqueda del paciente, sin campos del pedido', async () => {
    await openForm();
    expect(dlg().getByRole('heading', { name: 'Nueva orden de óptica' })).toBeInTheDocument();
    expect(dlg().getByRole('searchbox', { name: /Buscar paciente/ })).toBeInTheDocument();
    expect(dlg().queryByRole('textbox', { name: /Armazón/ })).not.toBeInTheDocument();
  });

  it('con una sola receta vigente queda elegida y aparecen los campos', async () => {
    const { received, user } = await openForm();
    await pickPatient(user);
    expect(await dlg().findByRole('textbox', { name: /Armazón/ })).toBeInTheDocument();
    expect(gets(received, '/pacientes/p1/recetas')).toHaveLength(1);
    expect(dlg().getByRole('radio')).toBeChecked();
    expect(dlg().getByText(/Receta del 01\/10\/2026 10:00/)).toBeInTheDocument();
    expect(dlg().getByRole('table', { name: 'Medidas de la receta' })).toBeInTheDocument();
  });

  it('crea la orden con los datos, avisa, cierra y recarga la lista', async () => {
    const { received, user } = await openForm();
    const before = gets(received, '/ordenes-optica').length;
    await pickPatient(user);
    await dlg().findByRole('textbox', { name: /Armazón/ });
    await fill(user, { frame: '  Armazón metálico  ', lenses: 'Progresivos', total: '120,50', deposit: '40', notes: ' Urgente ' });
    await user.click(dlg().getByRole('button', { name: 'Crear orden' }));
    expect(await screen.findByText('Orden creada para Ana Pérez.')).toBeInTheDocument();
    expect(posts(received)).toHaveLength(1);
    expect(posts(received)[0]).toMatchObject({
      url: '/ordenes-optica',
      body: {
        prescription_id: 'r1', frame_description: 'Armazón metálico', lens_description: 'Progresivos',
        total_amount: 120.5, deposit_amount: 40, notes: 'Urgente',
      },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(gets(received, '/ordenes-optica').length).toBeGreaterThan(before));
  });

  it('sin anticipo ni notas envía 0 y null', async () => {
    const { received, user } = await openForm();
    await pickPatient(user);
    await dlg().findByRole('textbox', { name: /Armazón/ });
    await fill(user, {});
    await user.click(dlg().getByRole('button', { name: 'Crear orden' }));
    await screen.findByText('Orden creada para Ana Pérez.');
    expect(posts(received)[0].body).toMatchObject({ deposit_amount: 0, notes: null, total_amount: 120 });
  });

  it('si hay filtro de estado, al crear vuelve a "Todos" para mostrar la orden nueva', async () => {
    const { received, user } = await openForm({ orders: [ORDER, withStatus({ ...ORDER, id: 'o2' }, 'ready')] });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'ready');
    await waitFor(() => expect(gets(received, '/ordenes-optica').at(-1)?.params).toMatchObject({ status: 'ready' }));
    await user.click(screen.getByRole('button', { name: 'Nueva orden' }));
    await pickPatient(user);
    await dlg().findByRole('textbox', { name: /Armazón/ });
    await fill(user, {});
    await user.click(dlg().getByRole('button', { name: 'Crear orden' }));
    await screen.findByText('Orden creada para Ana Pérez.');
    expect(screen.getByRole('combobox', { name: 'Estado' })).toHaveValue('');
    await waitFor(() => expect(gets(received, '/ordenes-optica').at(-1)?.params).not.toHaveProperty('status'));
  });

  it('con varias recetas vigentes hay que elegir una; los campos aparecen al elegir', async () => {
    const { received, user } = await openForm({ prescriptions: [RX_SECOND, RX, RX_OLD] });
    await pickPatient(user);
    const radios = await dlg().findAllByRole('radio');
    expect(radios).toHaveLength(2); // la reemplazada no se ofrece
    expect(radios[0]).not.toBeChecked();
    expect(dlg().queryByRole('textbox', { name: /Armazón/ })).not.toBeInTheDocument();
    await user.click(dlg().getByRole('radio', { name: /Receta del 20\/10\/2026/ }));
    await dlg().findByRole('textbox', { name: /Armazón/ });
    await fill(user, {});
    await user.click(dlg().getByRole('button', { name: 'Crear orden' }));
    await screen.findByText('Orden creada para Ana Pérez.');
    expect(posts(received)[0].body).toMatchObject({ prescription_id: 'r2' });
  });

  it('sin receta vigente lo explica y no ofrece el pedido', async () => {
    const { user } = await openForm({ prescriptions: [RX_OLD] });
    await pickPatient(user);
    expect(await dlg().findByText(/no tiene una receta vigente/)).toBeInTheDocument();
    expect(dlg().queryByRole('textbox', { name: /Armazón/ })).not.toBeInTheDocument();
  });

  it('sin consentimiento muestra el mensaje del servidor y no se puede continuar', async () => {
    const { received, user } = await openForm({
      override: (request) =>
        request.url === '/pacientes/p1/recetas'
          ? { status: 403, data: { message: 'El paciente no ha autorizado que la óptica vea su receta.' } }
          : undefined,
    });
    await pickPatient(user);
    expect(await dlg().findByText('El paciente no ha autorizado que la óptica vea su receta.')).toBeInTheDocument();
    expect(dlg().queryByRole('textbox', { name: /Armazón/ })).not.toBeInTheDocument();
    await user.click(dlg().getByRole('button', { name: 'Crear orden' }));
    expect(dlg().getByText('Elija la receta de la orden.')).toBeInTheDocument();
    expect(posts(received)).toHaveLength(0);
  });

  it('sin paciente elegido pide elegirlo', async () => {
    const { received, user } = await openForm();
    await user.click(dlg().getByRole('button', { name: 'Crear orden' }));
    expect(dlg().getByText('Elija el paciente.')).toBeInTheDocument();
    expect(posts(received)).toHaveLength(0);
  });

  it('al cambiar de paciente se olvida la receta y el pedido se oculta', async () => {
    const { user } = await openForm();
    await pickPatient(user);
    await dlg().findByRole('textbox', { name: /Armazón/ });
    await user.click(dlg().getByRole('button', { name: 'Cambiar' }));
    expect(dlg().queryByRole('textbox', { name: /Armazón/ })).not.toBeInTheDocument();
    expect(dlg().queryByRole('radio')).not.toBeInTheDocument();
    expect(dlg().getByRole('searchbox', { name: /Buscar paciente/ })).toBeInTheDocument();
  });

  it.each([
    ['sin armazón', { frame: ' ' }, 'Indique el armazón.'],
    ['sin lentes', { lenses: ' ' }, 'Indique los lentes.'],
    ['total en cero', { total: '0' }, 'El total debe ser mayor que cero.'],
    ['total con letras', { total: 'abc' }, 'El total debe ser un monto en dólares, con a lo más dos decimales.'],
    ['anticipo mayor que el total', { total: '50', deposit: '60' }, 'El anticipo no puede pasar del total.'],
  ])('valida en pantalla (%s) sin llamar al servidor y deja lo escrito', async (_name, values, message) => {
    const { received, user } = await openForm();
    await pickPatient(user);
    await dlg().findByRole('textbox', { name: /Armazón/ });
    // Los campos obligatorios vacíos se prueban dejándolos sin escribir.
    const base = { frame: 'Armazón', lenses: 'Lentes', total: '100', deposit: '' };
    const merged = { ...base, ...values };
    if (merged.frame.trim() !== '') await user.type(dlg().getByRole('textbox', { name: /Armazón/ }), merged.frame);
    if (merged.lenses.trim() !== '') await user.type(dlg().getByRole('textbox', { name: /Lentes/ }), merged.lenses);
    await user.type(dlg().getByRole('textbox', { name: /Total/ }), merged.total);
    if (merged.deposit !== '') await user.type(dlg().getByRole('textbox', { name: /Anticipo/ }), merged.deposit);
    await user.click(dlg().getByRole('button', { name: 'Crear orden' }));
    expect(dlg().getByText(message)).toBeInTheDocument();
    expect(posts(received)).toHaveLength(0);
    expect(dlg().getByRole('textbox', { name: /Total/ })).toHaveValue(merged.total);
  });

  it('si el servidor la rechaza muestra su mensaje y deja reintentar con lo escrito', async () => {
    const { user } = await openForm({
      override: (request) =>
        request.method === 'post' ? { status: 409, data: { message: 'Esa receta fue reemplazada. Use la receta vigente del paciente.' } } : undefined,
    });
    await pickPatient(user);
    await dlg().findByRole('textbox', { name: /Armazón/ });
    await fill(user, {});
    await user.click(dlg().getByRole('button', { name: 'Crear orden' }));
    expect(await dlg().findByText('Esa receta fue reemplazada. Use la receta vigente del paciente.')).toBeInTheDocument();
    expect(dlg().getByRole('textbox', { name: /Armazón/ })).toHaveValue('Armazón negro');
    expect(dlg().getByRole('button', { name: 'Crear orden' })).toBeEnabled();
  });

  it('un error sin mensaje usa el texto de reserva', async () => {
    const { user } = await openForm({ override: (request) => (request.method === 'post' ? { status: 500 } : undefined) });
    await pickPatient(user);
    await dlg().findByRole('textbox', { name: /Armazón/ });
    await fill(user, {});
    await user.click(dlg().getByRole('button', { name: 'Crear orden' }));
    expect(await dlg().findByText('No se pudo crear la orden.')).toBeInTheDocument();
  });

  it('Cancelar cierra sin enviar nada', async () => {
    const { received, user } = await openForm();
    await user.click(dlg().getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(posts(received)).toHaveLength(0);
  });

  it('un aviso anterior desaparece al abrir "Nueva orden"', async () => {
    const { user } = await openForm();
    await pickPatient(user);
    await dlg().findByRole('textbox', { name: /Armazón/ });
    await fill(user, {});
    await user.click(dlg().getByRole('button', { name: 'Crear orden' }));
    await screen.findByText('Orden creada para Ana Pérez.');
    await user.click(screen.getByRole('button', { name: 'Nueva orden' }));
    expect(screen.queryByText('Orden creada para Ana Pérez.')).not.toBeInTheDocument();
  });
});
