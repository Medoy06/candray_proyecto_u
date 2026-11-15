// =============================================================================
// PaginaSucursales.prueba.tsx
// Qué prueba:   la pantalla de sucursales de punta a punta con una API falsa:
//               lista, errores y reintento, crear (validación y error del
//               servidor), editar (código bloqueado, solo lo cambiado) y
//               activar/desactivar con confirmación.
// Cómo:         cliente real + ayudas/apiFalsa.ts; sesión de ayudas/conSesion.tsx.
// =============================================================================
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PaginaSucursales } from '../../src/paginas/sucursales/PaginaSucursales';
import type { ManagedBranch } from '../../src/servicios/sucursales';
import { installFakeApi, type RecordedRequest } from '../ayudas/apiFalsa';
import { renderConSesion } from '../ayudas/conSesion';

const CENTRAL: ManagedBranch = {
  id: 'b1', code: 'CENTRAL', name: 'Candray Central', address: '1a Av. Norte, San Salvador', phone: '2233-6500',
  opening_time: '08:00:00', closing_time: '18:00:00', theme_color: '#003449', has_optical_counter: true,
  is_active: true, created_at: '', user_count: 2,
};
const ESCALON: ManagedBranch = {
  ...CENTRAL, id: 'b2', code: 'ESCALON', name: 'Candray Escalón', address: 'Colonia Escalón', phone: null,
  theme_color: '#276876', has_optical_counter: false, user_count: 0,
};
const METROSUR: ManagedBranch = {
  ...CENTRAL, id: 'b3', code: 'METROSUR', name: 'Metrosur', address: null, phone: null, opening_time: '09:30:00',
  closing_time: '17:30:00', theme_color: '#2F695F', is_active: false, user_count: 0,
};

type Reply = { status: number; data?: unknown } | undefined;
function server(overrides: (request: RecordedRequest) => Reply = () => undefined) {
  return installFakeApi((request) => {
    const custom = overrides(request);
    if (custom !== undefined) return custom;
    if (request.method === 'get' && request.url === '/sucursales') return { status: 200, data: { data: [CENTRAL, ESCALON, METROSUR] } };
    if (request.method === 'post' && request.url === '/sucursales') return { status: 201, data: { data: { ...CENTRAL, id: 'nueva', name: 'Candray Nueva' } } };
    if (request.method === 'patch') return { status: 200, data: { data: CENTRAL } };
    return { status: 404 };
  });
}

const mount = () => renderConSesion(<PaginaSucursales />, { role: 'admin', capabilities: ['branches_manage'] });
const row = (name: string) => screen.getByText(name).closest('tr')!;
const dlg = () => within(screen.getByRole('dialog'));
const field = (name: string) => dlg().getByRole('textbox', { name });
const getsOf = (received: RecordedRequest[]) => received.filter((r) => r.method === 'get' && r.url === '/sucursales');
const writes = (received: RecordedRequest[], method: string) => received.filter((r) => r.method === method);

describe('PaginaSucursales — lista', () => {
  it('muestra nombre, código, dirección, teléfono, horario, óptica y usuarios', async () => {
    server();
    mount();
    await screen.findByText('Candray Central');
    const central = within(row('Candray Central'));
    expect(central.getByText('CENTRAL')).toBeInTheDocument();
    expect(central.getByText('1a Av. Norte, San Salvador')).toBeInTheDocument();
    expect(central.getByText('2233-6500')).toBeInTheDocument();
    expect(central.getByText('08:00 – 18:00')).toBeInTheDocument();
    expect(central.getByText('Sí')).toBeInTheDocument();
    expect(central.getByText('2')).toBeInTheDocument();
    expect(within(row('Candray Escalón')).getByText('No')).toBeInTheDocument();
  });

  it('lo que falta se dice con palabras, no queda en blanco', async () => {
    server();
    mount();
    await screen.findByText('Metrosur');
    const metrosur = within(row('Metrosur'));
    expect(metrosur.getByText('Sin dirección')).toBeInTheDocument();
    expect(metrosur.getByText('Sin teléfono')).toBeInTheDocument();
    expect(within(row('Candray Escalón')).getByText('Sin teléfono')).toBeInTheDocument();
  });

  it('la tabla tiene nombre accesible y Desactivar va en estilo de peligro, Activar no', async () => {
    server();
    mount();
    await screen.findByText('Metrosur');
    expect(screen.getByRole('table', { name: 'Lista de sucursales' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desactivar Candray Central' })).toHaveClass('border-marca');
    expect(screen.getByRole('button', { name: 'Activar Metrosur' })).not.toHaveClass('border-marca');
  });

  it('el estado se escribe (Activa / Inactiva), no solo se colorea', async () => {
    server();
    mount();
    await screen.findByText('Metrosur');
    expect(within(row('Candray Central')).getByText('Activa')).toBeInTheDocument();
    expect(within(row('Metrosur')).getByText('Inactiva')).toBeInTheDocument();
    expect(within(row('Metrosur')).getByRole('button', { name: 'Activar Metrosur' })).toBeInTheDocument();
  });

  it('el punto de color es decorativo y usa el color de la sucursal', async () => {
    server();
    mount();
    await screen.findByText('Candray Central');
    const dot = row('Candray Central').querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(dot).toHaveStyle({ backgroundColor: '#003449' });
  });

  it('sin sucursales lo dice en vez de mostrar una tabla vacía', async () => {
    server((r) => (r.method === 'get' ? { status: 200, data: { data: [] } } : undefined));
    mount();
    await screen.findByText(/Todavía no hay sucursales/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('si falla la carga muestra el error del servidor y permite reintentar', async () => {
    let fail = true;
    server((r) => (r.method === 'get' && fail ? { status: 500, data: { message: 'Fallo interno.' } } : undefined));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo interno.');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Candray Central');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('PaginaSucursales — crear', () => {
  async function openCreate() {
    const received = server();
    mount();
    await screen.findByText('Candray Central');
    await userEvent.click(screen.getByRole('button', { name: /Nueva sucursal/ }));
    await screen.findByRole('dialog', { name: 'Nueva sucursal' });
    return received;
  }
  const submit = () => userEvent.click(screen.getByRole('button', { name: 'Crear sucursal' }));

  it('arranca con horario 08:00–18:00 y sin óptica', async () => {
    await openCreate();
    expect(dlg().getByLabelText(/Apertura/)).toHaveValue('08:00');
    expect(dlg().getByLabelText(/Cierre/)).toHaveValue('18:00');
    expect(dlg().getByRole('checkbox', { name: 'Tiene mostrador de óptica' })).not.toBeChecked();
  });

  it('el código se escribe en MAYÚSCULAS aunque se teclee en minúsculas', async () => {
    await openCreate();
    await userEvent.type(field('Código'), 'sur_2');
    expect(field('Código')).toHaveValue('SUR_2');
  });

  it('valida en pantalla, sin llamar al servidor', async () => {
    const received = await openCreate();
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent('El código usa solo MAYÚSCULAS');
    await userEvent.type(field('Código'), 'NUEVA');
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent('Escriba el nombre');
    await userEvent.type(field('Nombre'), 'Candray Nueva');
    fireEvent.change(dlg().getByLabelText(/Apertura/), { target: { value: '19:00' } });
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent('La hora de apertura debe ser anterior a la de cierre.');
    expect(writes(received, 'post')).toHaveLength(0);
  });

  it('crea la sucursal con todos los datos, avisa y refresca la lista', async () => {
    const received = await openCreate();
    await userEvent.type(field('Código'), 'nueva');
    await userEvent.type(field('Nombre'), '  Candray Nueva ');
    await userEvent.type(field('Dirección'), 'Calle 5');
    await userEvent.type(field('Teléfono'), '2200-1111');
    fireEvent.change(dlg().getByLabelText(/Apertura/), { target: { value: '07:30' } });
    fireEvent.change(dlg().getByLabelText(/Cierre/), { target: { value: '17:00' } });
    fireEvent.change(dlg().getByLabelText(/Color de la sucursal/), { target: { value: '#112233' } });
    await userEvent.click(dlg().getByRole('checkbox', { name: 'Tiene mostrador de óptica' }));
    await submit();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(writes(received, 'post')[0].body).toEqual({
      code: 'NUEVA', name: 'Candray Nueva', address: 'Calle 5', phone: '2200-1111', opening_time: '07:30',
      closing_time: '17:00', theme_color: '#112233', has_optical_counter: true,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Sucursal Candray Nueva creada.');
    await waitFor(() => expect(getsOf(received).length).toBeGreaterThanOrEqual(2));
  });

  it('dirección y teléfono vacíos se envían como null', async () => {
    const received = await openCreate();
    await userEvent.type(field('Código'), 'SOLO');
    await userEvent.type(field('Nombre'), 'Solo nombre');
    await submit();
    await waitFor(() => expect(writes(received, 'post')).toHaveLength(1));
    expect(writes(received, 'post')[0].body).toMatchObject({ address: null, phone: null });
  });

  it('si el servidor rechaza (código repetido) muestra su mensaje y deja reintentar', async () => {
    const received = server((r) =>
      r.method === 'post' ? { status: 409, data: { message: 'Ya existe una sucursal con ese código.' } } : undefined,
    );
    mount();
    await screen.findByText('Candray Central');
    await userEvent.click(screen.getByRole('button', { name: /Nueva sucursal/ }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Código' }), 'CENTRAL');
    await userEvent.type(field('Nombre'), 'Repetida');
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una sucursal con ese código.');
    expect(screen.getByRole('dialog', { name: 'Nueva sucursal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear sucursal' })).toBeEnabled();
    expect(writes(received, 'post')).toHaveLength(1);
  });

  it('Cancelar cierra sin enviar nada', async () => {
    const received = await openCreate();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(writes(received, 'post')).toHaveLength(0);
  });

  it('el botón principal usa el estilo primario', async () => {
    await openCreate();
    expect(screen.getByRole('button', { name: 'Crear sucursal' })).toHaveClass('bg-marca');
  });
});

describe('PaginaSucursales — editar', () => {
  async function openEdit(name = 'Candray Central') {
    const received = server();
    mount();
    await screen.findByText(name);
    await userEvent.click(screen.getByRole('button', { name: `Editar ${name}` }));
    await screen.findByRole('dialog', { name: 'Editar sucursal' });
    return received;
  }
  const save = () => userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

  it('muestra los datos actuales y el código bloqueado', async () => {
    await openEdit();
    expect(field('Código')).toHaveValue('CENTRAL');
    expect(field('Código')).toBeDisabled();
    expect(field('Nombre')).toHaveValue('Candray Central');
    expect(field('Dirección')).toHaveValue('1a Av. Norte, San Salvador');
    expect(dlg().getByLabelText(/Apertura/)).toHaveValue('08:00');
    expect(dlg().getByRole('checkbox', { name: 'Tiene mostrador de óptica' })).toBeChecked();
  });

  it('sin cambios no llama al servidor', async () => {
    const received = await openEdit();
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent('No hay cambios que guardar.');
    expect(writes(received, 'patch')).toHaveLength(0);
  });

  it('envía solo lo que cambió y avisa', async () => {
    const received = await openEdit();
    fireEvent.change(dlg().getByLabelText(/Cierre/), { target: { value: '17:00' } });
    await save();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(writes(received, 'patch')[0]).toMatchObject({ url: '/sucursales/b1', body: { closing_time: '17:00' } });
    expect(Object.keys(writes(received, 'patch')[0].body as object)).toEqual(['closing_time']);
    expect(screen.getByRole('status')).toHaveTextContent('Cambios guardados para Candray Central.');
  });

  it('vaciar el teléfono envía null', async () => {
    const received = await openEdit();
    await userEvent.clear(field('Teléfono'));
    await save();
    await waitFor(() => expect(writes(received, 'patch')).toHaveLength(1));
    expect(writes(received, 'patch')[0].body).toEqual({ phone: null });
  });

  it('un horario inválido se rechaza en pantalla', async () => {
    const received = await openEdit();
    fireEvent.change(dlg().getByLabelText(/Apertura/), { target: { value: '18:30' } });
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent('anterior');
    expect(writes(received, 'patch')).toHaveLength(0);
  });

  it('muestra el error del servidor y deja reintentar', async () => {
    const received = server((r) => (r.method === 'patch' ? { status: 404, data: { message: 'Sucursal no encontrada.' } } : undefined));
    mount();
    await screen.findByText('Candray Central');
    await userEvent.click(screen.getByRole('button', { name: 'Editar Candray Central' }));
    await userEvent.clear(await screen.findByRole('textbox', { name: 'Nombre' }));
    await userEvent.type(field('Nombre'), 'Otro nombre');
    await save();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sucursal no encontrada.');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
    expect(writes(received, 'patch')).toHaveLength(1);
  });
});

describe('PaginaSucursales — activar y desactivar', () => {
  it('pide confirmación (en estilo de peligro) y, al confirmar, desactiva', async () => {
    const received = server();
    mount();
    await screen.findByText('Candray Central');
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar Candray Central' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Desactivar sucursal' });
    expect(dialog).toHaveTextContent('Tiene 2 usuario(s) asignado(s).');
    expect(writes(received, 'patch')).toHaveLength(0); // todavía nada
    expect(within(dialog).getByRole('button', { name: 'Desactivar' })).toHaveClass('border-marca');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(writes(received, 'patch')[0]).toMatchObject({ url: '/sucursales/b1', body: { is_active: false } });
    expect(screen.getByRole('status')).toHaveTextContent('Candray Central fue desactivada.');
  });

  it('si no tiene usuarios, el aviso no habla de usuarios', async () => {
    server();
    mount();
    await screen.findByText('Candray Escalón');
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar Candray Escalón' }));
    expect(await screen.findByRole('alertdialog')).not.toHaveTextContent('usuario');
  });

  it('Cancelar no cambia nada', async () => {
    const received = server();
    mount();
    await screen.findByText('Candray Central');
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar Candray Central' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(writes(received, 'patch')).toHaveLength(0);
  });

  it('activar una inactiva envía is_active true, con botón primario (no destructivo)', async () => {
    const received = server();
    mount();
    await screen.findByText('Metrosur');
    await userEvent.click(screen.getByRole('button', { name: 'Activar Metrosur' }));
    const confirm = await screen.findByRole('button', { name: 'Activar' });
    expect(confirm).toHaveClass('bg-marca');
    await userEvent.click(confirm);
    await waitFor(() => expect(writes(received, 'patch')).toHaveLength(1));
    expect(writes(received, 'patch')[0]).toMatchObject({ url: '/sucursales/b3', body: { is_active: true } });
    expect(await screen.findByText('Metrosur fue activada.')).toBeInTheDocument();
  });

  it('si el servidor lo rechaza muestra el error en la página', async () => {
    server((r) => (r.method === 'patch' ? { status: 500, data: { message: 'Fallo interno.' } } : undefined));
    mount();
    await screen.findByText('Candray Central');
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar Candray Central' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo interno.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
