// =============================================================================
// PaginaPanel.prueba.tsx
// Qué prueba:   el panel de indicadores: que muestre los números de cada
//               sucursal y el total, que no repita el total cuando hay una sola
//               sucursal, el dinero con formato, la carga, el error con
//               "Reintentar" y el caso sin sucursales.
// Cómo:         la página con el cliente real + ayudas/apiFalsa.ts, dentro de
//               una sesión de ayudas/conSesion.tsx.
// =============================================================================
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PaginaPanel } from '../../src/paginas/panel/PaginaPanel';
import type { BranchIndicators, Indicators, Panel } from '../../src/servicios/panel';
import { installFakeApi } from '../ayudas/apiFalsa';
import { renderConSesion } from '../ayudas/conSesion';

const CENTRAL_NUMBERS: Indicators = {
  appointments_today: { scheduled: 4, completed: 3, no_show: 2, cancelled: 1 },
  appointments_next_7_days: 11,
  orders_open: { pending: 5, in_lab: 6, ready: 7 },
  delivered_last_30_days: 8,
  sales_last_30_days: 1234.5,
};
const ESCALON_NUMBERS: Indicators = {
  appointments_today: { scheduled: 14, completed: 13, no_show: 12, cancelled: 15 },
  appointments_next_7_days: 21,
  orders_open: { pending: 25, in_lab: 26, ready: 27 },
  delivered_last_30_days: 28,
  sales_last_30_days: 99,
};
const TOTALS: Indicators = {
  appointments_today: { scheduled: 18, completed: 16, no_show: 14, cancelled: 16 },
  appointments_next_7_days: 32,
  orders_open: { pending: 30, in_lab: 32, ready: 34 },
  delivered_last_30_days: 36,
  sales_last_30_days: 1333.5,
};
const CENTRAL: BranchIndicators = { branch_id: 'b1', branch_name: 'Candray Central', ...CENTRAL_NUMBERS };
const ESCALON: BranchIndicators = { branch_id: 'b2', branch_name: 'Candray Escalón', ...ESCALON_NUMBERS };

const panel = (branches: BranchIndicators[], totals: Indicators = TOTALS): Panel => ({ as_of: '2026-11-16', totals, branches });
const mount = () => renderConSesion(<PaginaPanel />, { capabilities: ['dashboard_read'], role: 'directivo' });
const cardOf = (title: string) => screen.getByRole('heading', { level: 2, name: title }).closest('section') as HTMLElement;

describe('el panel con varias sucursales', () => {
  it('muestra el título, la fecha de los números y que no hay datos de pacientes', async () => {
    installFakeApi(() => ({ status: 200, data: { data: panel([CENTRAL, ESCALON]) } }));
    mount();
    expect(screen.getByRole('heading', { level: 1, name: 'Panel de indicadores' })).toBeInTheDocument();
    expect(await screen.findByText('Números al 16/11/2026. No incluye datos de pacientes.')).toBeInTheDocument();
  });

  it('pide solo el panel al servidor', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: panel([CENTRAL, ESCALON]) } }));
    mount();
    await screen.findByText('Todas las sucursales');
    expect(received.map((request) => `${request.method} ${request.url}`)).toEqual(['get /panel']);
  });

  it('dibuja una tarjeta por sucursal y una con el total, en ese orden', async () => {
    installFakeApi(() => ({ status: 200, data: { data: panel([CENTRAL, ESCALON]) } }));
    mount();
    await screen.findByText('Todas las sucursales');
    const titles = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(titles).toEqual(['Todas las sucursales', 'Candray Central', 'Candray Escalón']);
  });

  it('cada tarjeta muestra los números de SU sucursal', async () => {
    installFakeApi(() => ({ status: 200, data: { data: panel([CENTRAL, ESCALON]) } }));
    mount();
    await screen.findByText('Todas las sucursales');
    const central = within(cardOf('Candray Central'));
    expect(central.getByText('Agendadas').nextElementSibling).toHaveTextContent('4');
    expect(central.getByText('Atendidas').nextElementSibling).toHaveTextContent('3');
    expect(central.getByText('Ausentes').nextElementSibling).toHaveTextContent('2');
    expect(central.getByText('Canceladas').nextElementSibling).toHaveTextContent('1');
    expect(central.getByText('Citas agendadas').nextElementSibling).toHaveTextContent('11');
    expect(central.getByText('Pendientes').nextElementSibling).toHaveTextContent('5');
    expect(central.getByText('En taller').nextElementSibling).toHaveTextContent('6');
    expect(central.getByText('Listas').nextElementSibling).toHaveTextContent('7');
    expect(central.getByText('Órdenes').nextElementSibling).toHaveTextContent('8');

    const escalon = within(cardOf('Candray Escalón'));
    expect(escalon.getByText('Agendadas').nextElementSibling).toHaveTextContent('14');
    expect(escalon.getByText('Listas').nextElementSibling).toHaveTextContent('27');
  });

  it('la tarjeta del total muestra los totales que mandó el servidor, sin sumarlos aquí', async () => {
    // Los totales de prueba NO son la suma de las dos sucursales: si la pantalla
    // sumara por su cuenta, el número sería otro.
    installFakeApi(() => ({ status: 200, data: { data: panel([CENTRAL, ESCALON], { ...TOTALS, appointments_next_7_days: 777 }) } }));
    mount();
    await screen.findByText('Todas las sucursales');
    expect(within(cardOf('Todas las sucursales')).getByText('Citas agendadas').nextElementSibling).toHaveTextContent('777');
  });

  it('el dinero se escribe en dólares, con IVA incluido', async () => {
    installFakeApi(() => ({ status: 200, data: { data: panel([CENTRAL, ESCALON]) } }));
    mount();
    await screen.findByText('Todas las sucursales');
    expect(within(cardOf('Candray Central')).getByText('Ventas (IVA incluido)').nextElementSibling).toHaveTextContent('$1,234.50');
    expect(within(cardOf('Todas las sucursales')).getByText('Ventas (IVA incluido)').nextElementSibling).toHaveTextContent('$1,333.50');
  });

  it('un cero se muestra como 0, no como vacío', async () => {
    const zero: Indicators = {
      appointments_today: { scheduled: 0, completed: 0, no_show: 0, cancelled: 0 },
      appointments_next_7_days: 0, orders_open: { pending: 0, in_lab: 0, ready: 0 },
      delivered_last_30_days: 0, sales_last_30_days: 0,
    };
    installFakeApi(() => ({ status: 200, data: { data: panel([{ ...CENTRAL, ...zero }, ESCALON]) } }));
    mount();
    await screen.findByText('Todas las sucursales');
    const central = within(cardOf('Candray Central'));
    expect(central.getByText('Agendadas').nextElementSibling).toHaveTextContent(/^0$/);
    expect(central.getByText('Ventas (IVA incluido)').nextElementSibling).toHaveTextContent('$0.00');
  });
});

describe('estados de la pantalla', () => {
  it('con una sola sucursal no repite el total', async () => {
    installFakeApi(() => ({ status: 200, data: { data: panel([CENTRAL], CENTRAL_NUMBERS) } }));
    mount();
    await screen.findByRole('heading', { level: 2, name: 'Candray Central' });
    expect(screen.queryByText('Todas las sucursales')).not.toBeInTheDocument();
  });

  it('sin sucursales lo dice', async () => {
    installFakeApi(() => ({ status: 200, data: { data: panel([]) } }));
    mount();
    expect(await screen.findByText('No hay sucursales activas para mostrar.')).toBeInTheDocument();
  });

  it('mientras carga dice "Cargando indicadores..."', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    installFakeApi(async () => { await gate; return { status: 200, data: { data: panel([CENTRAL]) } }; });
    mount();
    expect(screen.getByText('Cargando indicadores...')).toBeInTheDocument();
    release();
    await screen.findByRole('heading', { level: 2, name: 'Candray Central' });
    expect(screen.queryByText('Cargando indicadores...')).not.toBeInTheDocument();
  });

  it('si falla, muestra el mensaje del servidor y "Reintentar" vuelve a pedir', async () => {
    let fail = true;
    const received = installFakeApi(() =>
      fail ? { status: 500, data: { message: 'La base no responde.' } } : { status: 200, data: { data: panel([CENTRAL]) } },
    );
    mount();
    expect(await screen.findByText('La base no responde.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('heading', { level: 2, name: 'Candray Central' });
    expect(screen.queryByText('La base no responde.')).not.toBeInTheDocument();
    await waitFor(() => expect(received).toHaveLength(2));
  });

  it('un error sin mensaje usa el texto de reserva', async () => {
    installFakeApi(() => ({ status: 500, data: {} }));
    mount();
    expect(await screen.findByText('No se pudo cargar el panel de indicadores.')).toBeInTheDocument();
  });
});
