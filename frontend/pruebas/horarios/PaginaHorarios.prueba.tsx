// =============================================================================
// PaginaHorarios.prueba.tsx
// Qué prueba:   la pantalla de horarios de médicos: elegir médico, la lista
//               ordenada, crear, editar (solo lo cambiado), eliminar con
//               confirmación, los errores del servidor dentro de la ventana y
//               los estados vacío y de error.
// Cómo:         la página con el cliente real + ayudas/apiFalsa.ts, dentro de
//               una sesión de ayudas/conSesion.tsx.
// =============================================================================
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PaginaHorarios } from '../../src/paginas/horarios/PaginaHorarios';
import type { ScheduleBlock } from '../../src/servicios/horarios';
import { installFakeApi, type FakeResponse, type RecordedRequest } from '../ayudas/apiFalsa';
import { renderConSesion } from '../ayudas/conSesion';
import { CENTRAL, ESCALON } from '../ayudas/datosSesion';
import { BRANCHES, DOCTOR, METROSUR_ID, branchOf } from '../ayudas/datosUsuarios';

const OTRO = { ...DOCTOR, id: 'u9', full_name: 'Pedro Doctor', branches: [branchOf({ ...CENTRAL, id: METROSUR_ID, code: 'METROSUR', name: 'Metrosur' })] };

const block = (extra: Partial<ScheduleBlock>): ScheduleBlock => ({
  id: 'h1', doctor_id: DOCTOR.id, doctor_name: DOCTOR.full_name, branch_id: CENTRAL.id, branch_code: 'CENTRAL',
  branch_name: CENTRAL.name, weekday: 1, start_time: '08:00:00', end_time: '12:00:00', created_at: '', ...extra,
});
const MIERCOLES = block({ id: 'h3', weekday: 3, start_time: '14:00:00', end_time: '17:00:00', branch_id: ESCALON.id, branch_name: ESCALON.name });
const LUNES_TARDE = block({ id: 'h2', weekday: 1, start_time: '13:00:00', end_time: '17:00:00' });
const LUNES = block({});

interface Setup {
  blocks?: ScheduleBlock[];
  doctors?: unknown[];
  onWrite?: (request: RecordedRequest) => FakeResponse;
}

function server({ blocks = [MIERCOLES, LUNES_TARDE, LUNES], doctors = [DOCTOR, OTRO], onWrite }: Setup = {}) {
  return installFakeApi((request) => {
    if (request.method === 'get' && request.url === '/usuarios') return { status: 200, data: { data: doctors } };
    if (request.method === 'get' && request.url === '/sucursales') return { status: 200, data: { data: BRANCHES } };
    if (request.method === 'get' && request.url === '/horarios') {
      return { status: 200, data: { data: blocks.filter((item) => item.doctor_id === request.params?.doctor_id) } };
    }
    return onWrite ? onWrite(request) : { status: 200, data: { data: LUNES } };
  });
}

const mount = () => renderConSesion(<PaginaHorarios />, { capabilities: ['schedules_manage'], role: 'admin' });
const writes = (received: RecordedRequest[]) => received.filter((request) => request.method !== 'get');
const dlg = () => within(screen.getByRole('dialog'));

describe('la lista', () => {
  it('pide solo médicos activos y los bloques del primer médico', async () => {
    const received = server();
    mount();
    await screen.findByRole('table', { name: 'Bloques de horario' });
    const users = received.find((request) => request.url === '/usuarios');
    expect(users?.params).toEqual({ role: 'doctor', is_active: 'true' });
    expect(received.find((request) => request.url === '/horarios')?.params).toEqual({ doctor_id: DOCTOR.id });
  });

  it('muestra los bloques de lunes a domingo y, en el mismo día, por hora de inicio', async () => {
    server();
    mount();
    const table = await screen.findByRole('table', { name: 'Bloques de horario' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Lunes'),
      expect.stringContaining('Lunes'),
      expect.stringContaining('Miércoles'),
    ]);
    expect(rows[0].textContent).toMatch(/08:00.*12:00/);
    expect(rows[1].textContent).toMatch(/13:00.*17:00/);
    expect(rows[2].textContent).toContain(ESCALON.name);
  });

  it('un médico sin bloques muestra el estado vacío con su nombre', async () => {
    server({ blocks: [] });
    mount();
    expect(await screen.findByText(/Marta Doctora todavía no tiene horario/)).toBeInTheDocument();
  });

  it('al elegir otro médico se piden los bloques de ese médico', async () => {
    const received = server({ blocks: [LUNES, block({ id: 'x', doctor_id: OTRO.id, weekday: 5 })] });
    mount();
    await screen.findByRole('table', { name: 'Bloques de horario' });
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Médico' }), OTRO.id);
    expect(await screen.findByText('Viernes')).toBeInTheDocument();
    expect(received.filter((request) => request.url === '/horarios').map((request) => request.params)).toEqual([
      { doctor_id: DOCTOR.id },
      { doctor_id: OTRO.id },
    ]);
  });

  it('si no hay médicos activos lo dice y no ofrece crear bloques', async () => {
    server({ doctors: [] });
    mount();
    expect(await screen.findByText(/No hay médicos activos/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nuevo bloque/ })).not.toBeInTheDocument();
  });

  it('si falla la carga de médicos muestra el error', async () => {
    installFakeApi(() => ({ status: 500, data: {} }));
    mount();
    expect(await screen.findByText('No se pudo cargar la lista de médicos.')).toBeInTheDocument();
  });

  it('si falla la carga de bloques muestra el error y "Reintentar" los vuelve a pedir', async () => {
    let fail = true;
    installFakeApi((request) => {
      if (request.url === '/usuarios') return { status: 200, data: { data: [DOCTOR] } };
      if (request.url === '/sucursales') return { status: 200, data: { data: BRANCHES } };
      return fail ? { status: 500, data: {} } : { status: 200, data: { data: [LUNES] } };
    });
    mount();
    expect(await screen.findByText('No se pudieron cargar los horarios.')).toBeInTheDocument();
    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table', { name: 'Bloques de horario' })).toBeInTheDocument();
  });

  it('un médico sin sucursal activa asignada avisa y no deja crear', async () => {
    server({ doctors: [{ ...DOCTOR, branches: [] }], blocks: [] });
    mount();
    expect(await screen.findByText(/no tiene una sucursal activa asignada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nuevo bloque/ })).toBeDisabled();
  });
});

describe('crear un bloque', () => {
  it('ofrece solo las sucursales activas del médico y envía el bloque elegido', async () => {
    const received = server({ onWrite: () => ({ status: 201, data: { data: LUNES } }) });
    mount();
    await screen.findByRole('table', { name: 'Bloques de horario' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Nuevo bloque/ }));

    const branchSelect = dlg().getByRole('combobox', { name: /Sucursal/ });
    expect(within(branchSelect).getAllByRole('option').map((option) => option.textContent)).toEqual([CENTRAL.name, ESCALON.name]);

    await user.selectOptions(dlg().getByRole('combobox', { name: /Día/ }), '4');
    await user.selectOptions(dlg().getByRole('combobox', { name: /Hora de inicio/ }), '09:00');
    await user.selectOptions(dlg().getByRole('combobox', { name: /Hora de fin/ }), '12:30');
    await user.click(dlg().getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Bloque creado.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(writes(received)).toHaveLength(1);
    expect(writes(received)[0]).toMatchObject({
      method: 'post', url: '/horarios',
      body: { doctor_id: DOCTOR.id, branch_id: CENTRAL.id, weekday: 4, start_time: '09:00', end_time: '12:30' },
    });
    // Después de crear se vuelve a pedir la lista.
    expect(received.filter((request) => request.url === '/horarios' && request.method === 'get')).toHaveLength(2);
  });

  it('una sucursal inactiva del médico no se ofrece', async () => {
    const withInactive = { ...DOCTOR, branches: [branchOf(CENTRAL), branchOf({ ...ESCALON, id: METROSUR_ID, code: 'METROSUR', name: 'Metrosur' }, false)] };
    server({ doctors: [withInactive] });
    mount();
    await screen.findByRole('table', { name: 'Bloques de horario' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Nuevo bloque/ }));
    const options = within(dlg().getByRole('combobox', { name: /Sucursal/ })).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([CENTRAL.name]);
  });

  it('las horas se limitan al horario de la sucursal y no se puede elegir un inicio igual al cierre', async () => {
    server();
    mount();
    await screen.findByRole('table', { name: 'Bloques de horario' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Nuevo bloque/ }));
    const starts = within(dlg().getByRole('combobox', { name: /Hora de inicio/ })).getAllByRole('option').map((o) => o.textContent);
    const ends = within(dlg().getByRole('combobox', { name: /Hora de fin/ })).getAllByRole('option').map((o) => o.textContent);
    expect(starts[0]).toBe('08:00');
    expect(starts[starts.length - 1]).toBe('16:30');
    expect(ends[0]).toBe('08:30');
    expect(ends[ends.length - 1]).toBe('17:00');
  });

  it('un inicio igual o posterior al fin se rechaza en la ventana, sin llamar al servidor', async () => {
    const received = server();
    mount();
    await screen.findByRole('table', { name: 'Bloques de horario' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Nuevo bloque/ }));
    await user.selectOptions(dlg().getByRole('combobox', { name: /Hora de inicio/ }), '10:00');
    await user.selectOptions(dlg().getByRole('combobox', { name: /Hora de fin/ }), '09:30');
    await user.click(dlg().getByRole('button', { name: 'Guardar' }));
    expect(await dlg().findByText('La hora de inicio debe ser anterior a la de fin.')).toBeInTheDocument();
    expect(writes(received)).toHaveLength(0);
  });

  it('el error del servidor (por ejemplo un cruce) se muestra dentro de la ventana, que sigue abierta', async () => {
    server({ onWrite: () => ({ status: 409, data: { message: 'El médico ya tiene un bloque que se cruza con ese horario.' } }) });
    mount();
    await screen.findByRole('table', { name: 'Bloques de horario' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Nuevo bloque/ }));
    await user.click(dlg().getByRole('button', { name: 'Guardar' }));
    expect(await dlg().findByText('El médico ya tiene un bloque que se cruza con ese horario.')).toBeInTheDocument();
    expect(dlg().getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });

  it('al cambiar de sucursal se proponen la apertura y el cierre de la nueva', async () => {
    const received = server({ onWrite: () => ({ status: 201, data: { data: LUNES } }) });
    mount();
    await screen.findByRole('table', { name: 'Bloques de horario' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Nuevo bloque/ }));
    await user.selectOptions(dlg().getByRole('combobox', { name: /Hora de inicio/ }), '10:00');
    await user.selectOptions(dlg().getByRole('combobox', { name: /Sucursal/ }), ESCALON.id);
    expect(dlg().getByRole('combobox', { name: /Hora de inicio/ })).toHaveValue('08:00');
    expect(dlg().getByRole('combobox', { name: /Hora de fin/ })).toHaveValue('17:00');
    await user.click(dlg().getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Bloque creado.');
    expect(writes(received)[0].body).toMatchObject({ branch_id: ESCALON.id, start_time: '08:00', end_time: '17:00' });
  });

  it('Cancelar cierra la ventana sin guardar', async () => {
    const received = server();
    mount();
    await screen.findByRole('table', { name: 'Bloques de horario' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Nuevo bloque/ }));
    await user.click(dlg().getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(writes(received)).toHaveLength(0);
  });
});

describe('editar un bloque', () => {
  async function openEdit(received?: { onWrite?: Setup['onWrite'] }) {
    const calls = server(received);
    mount();
    const table = await screen.findByRole('table', { name: 'Bloques de horario' });
    const user = userEvent.setup();
    await user.click(within(within(table).getAllByRole('row')[1]).getByRole('button', { name: /Editar/ }));
    return { calls, user };
  }

  it('abre con los valores del bloque y envía solo lo que cambió', async () => {
    const { calls, user } = await openEdit({ onWrite: () => ({ status: 200, data: { data: LUNES } }) });
    expect(dlg().getByRole('combobox', { name: /Día/ })).toHaveValue('1');
    expect(dlg().getByRole('combobox', { name: /Hora de inicio/ })).toHaveValue('08:00');
    expect(dlg().getByRole('combobox', { name: /Hora de fin/ })).toHaveValue('12:00');
    await user.selectOptions(dlg().getByRole('combobox', { name: /Hora de fin/ }), '13:00');
    await user.click(dlg().getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Bloque actualizado.')).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(1);
    expect(writes(calls)[0]).toMatchObject({ method: 'patch', url: '/horarios/h1', body: { end_time: '13:00' } });
    expect(Object.keys(writes(calls)[0].body as object)).toEqual(['end_time']);
  });

  it('si no se cambió nada lo dice y no llama al servidor', async () => {
    const { calls, user } = await openEdit();
    await user.click(dlg().getByRole('button', { name: 'Guardar' }));
    expect(await dlg().findByText('No hay cambios que guardar.')).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it('el error del servidor (citas sin cubrir) se muestra dentro de la ventana', async () => {
    const { user } = await openEdit({ onWrite: () => ({ status: 409, data: { message: 'Hay citas futuras que quedarían sin cubrir.' } }) });
    await user.selectOptions(dlg().getByRole('combobox', { name: /Hora de fin/ }), '11:00');
    await user.click(dlg().getByRole('button', { name: 'Guardar' }));
    expect(await dlg().findByText('Hay citas futuras que quedarían sin cubrir.')).toBeInTheDocument();
  });
});

describe('eliminar un bloque', () => {
  async function askDelete(onWrite?: Setup['onWrite']) {
    const calls = server({ onWrite });
    mount();
    const table = await screen.findByRole('table', { name: 'Bloques de horario' });
    const user = userEvent.setup();
    await user.click(within(within(table).getAllByRole('row')[1]).getByRole('button', { name: /Eliminar/ }));
    return { calls, user };
  }

  it('pide confirmación y no elimina hasta confirmar', async () => {
    const { calls } = await askDelete();
    const confirm = within(screen.getByRole('alertdialog'));
    expect(confirm.getByText(/bloque del lunes en Candray Central/)).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it('al confirmar envía DELETE, avisa y vuelve a pedir la lista', async () => {
    const { calls, user } = await askDelete(() => ({ status: 200, data: { success: true, data: null } }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('Bloque eliminado.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(writes(calls)).toHaveLength(1);
    expect(writes(calls)[0]).toMatchObject({ method: 'delete', url: '/horarios/h1' });
    expect(calls.filter((request) => request.url === '/horarios' && request.method === 'get')).toHaveLength(2);
  });

  it('cancelar la confirmación no elimina nada', async () => {
    const { calls, user } = await askDelete();
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it('si el servidor lo niega muestra el motivo en la página', async () => {
    const { user } = await askDelete(() => ({ status: 409, data: { message: 'El bloque tiene citas futuras.' } }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(screen.getByText('El bloque tiene citas futuras.')).toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Bloque eliminado.')).not.toBeInTheDocument();
  });
});
