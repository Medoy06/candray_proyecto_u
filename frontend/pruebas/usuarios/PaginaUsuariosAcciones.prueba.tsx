// =============================================================================
// PaginaUsuariosAcciones.prueba.tsx
// Qué prueba:   las acciones de la fila de usuarios del paso 5c-2: asignar
//               sucursales, cambiar la contraseña y desbloquear una cuenta.
// Cómo:         cliente real + API falsa (ayudas/datosUsuarios.tsx).
// =============================================================================
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { RecordedRequest } from '../ayudas/apiFalsa';
import { CENTRAL, ESCALON } from '../ayudas/datosSesion';
import { DOCTOR, METROSUR_ID, mount, row, SELF, server, usersGets } from '../ayudas/datosUsuarios';

const puts = (received: RecordedRequest[]) => received.filter((r) => r.method === 'put');

describe('Sucursales de un usuario', () => {
  async function openBranches(name = 'Marta Doctora') {
    const received = server();
    mount();
    await screen.findByText(name);
    await userEvent.click(screen.getByRole('button', { name: `Sucursales de ${name}` }));
    const dialog = await screen.findByRole('dialog', { name: 'Sucursales del usuario' });
    await within(dialog).findByLabelText('Candray Central'); // espera a que carguen las sucursales
    return { received, dialog };
  }
  const save = () => userEvent.click(screen.getByRole('button', { name: 'Guardar sucursales' }));

  it('arranca con las sucursales y la predeterminada actuales', async () => {
    const { dialog } = await openBranches();
    expect(within(dialog).getByLabelText('Candray Central')).toBeChecked();
    expect(within(dialog).getByLabelText('Candray Escalón')).toBeChecked();
    expect(within(dialog).getByLabelText('Sucursal predeterminada: Candray Central')).toBeChecked();
    expect(within(dialog).getByLabelText('Sucursal predeterminada: Candray Escalón')).not.toBeChecked();
  });

  it('no ofrece una sucursal inactiva que el usuario no tiene', async () => {
    const { dialog } = await openBranches();
    expect(within(dialog).queryByLabelText(/Metrosur/)).not.toBeInTheDocument();
  });

  it('SÍ muestra una sucursal inactiva que el usuario ya tiene, marcada "(inactiva)", para no quitarla sin avisar', async () => {
    const withInactive = { ...DOCTOR, branches: [...DOCTOR.branches, { id: METROSUR_ID, code: 'METROSUR', name: 'Metrosur', is_default: false }] };
    server((r) => (r.method === 'get' && r.url === '/usuarios' ? { status: 200, data: { data: [withInactive] } } : undefined));
    mount();
    await screen.findByText('Marta Doctora');
    await userEvent.click(screen.getByRole('button', { name: 'Sucursales de Marta Doctora' }));
    expect(await screen.findByLabelText('Metrosur (inactiva)')).toBeChecked();
  });

  it('sin cambios no llama al servidor', async () => {
    const { received } = await openBranches();
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent('No hay cambios que guardar.');
    expect(puts(received)).toHaveLength(0);
  });

  it('envía la lista completa y la nueva predeterminada, y avisa', async () => {
    const { received } = await openBranches();
    await userEvent.click(screen.getByLabelText('Sucursal predeterminada: Candray Escalón'));
    await save();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(puts(received)[0]).toMatchObject({
      url: '/usuarios/u2/sucursales',
      body: { branch_ids: [CENTRAL.id, ESCALON.id], default_branch_id: ESCALON.id },
    });
    expect(screen.getByRole('status')).toHaveTextContent('Sucursales actualizadas para Marta Doctora.');
  });

  it('quitar una sucursal: se envía la lista sin ella y la predeterminada sigue válida', async () => {
    const { received } = await openBranches();
    await userEvent.click(screen.getByLabelText('Candray Central')); // era la predeterminada
    await save();
    await waitFor(() => expect(puts(received)).toHaveLength(1));
    expect(puts(received)[0]).toMatchObject({ body: { branch_ids: [ESCALON.id], default_branch_id: ESCALON.id } });
  });

  it('un rol que necesita sucursal no deja guardar la lista vacía, sin llamar al servidor', async () => {
    const { received } = await openBranches();
    await userEvent.click(screen.getByLabelText('Candray Central'));
    await userEvent.click(screen.getByLabelText('Candray Escalón'));
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent('necesita al menos una sucursal');
    expect(puts(received)).toHaveLength(0);
  });

  it('a un administrador se le explica que es opcional', async () => {
    server();
    mount();
    await screen.findByText('Alejandro Mejía');
    await userEvent.click(screen.getByRole('button', { name: 'Sucursales de Alejandro Mejía' }));
    expect(await screen.findByText(/Asignarlas es opcional/)).toBeInTheDocument();
  });

  it('un administrador SÍ puede quedar sin sucursales (se envía la lista vacía)', async () => {
    const admin = { ...SELF, branches: [{ id: CENTRAL.id, code: 'CENTRAL', name: 'Candray Central', is_default: true }] };
    const received = server((r) => (r.method === 'get' && r.url === '/usuarios' ? { status: 200, data: { data: [admin] } } : undefined));
    mount();
    await screen.findByText('Alejandro Mejía');
    await userEvent.click(screen.getByRole('button', { name: 'Sucursales de Alejandro Mejía' }));
    await userEvent.click(await screen.findByLabelText('Candray Central')); // la desmarca
    await save();
    await waitFor(() => expect(puts(received)).toHaveLength(1));
    expect(puts(received)[0]).toMatchObject({ body: { branch_ids: [] } });
    expect(puts(received)[0].body).not.toHaveProperty('default_branch_id');
  });

  it('muestra el error del servidor y deja reintentar', async () => {
    server((r) =>
      r.method === 'put' ? { status: 400, data: { message: 'Alguna de las sucursales indicadas no existe.' } } : undefined,
    );
    mount();
    await screen.findByText('Marta Doctora');
    await userEvent.click(screen.getByRole('button', { name: 'Sucursales de Marta Doctora' }));
    await userEvent.click(await screen.findByLabelText('Sucursal predeterminada: Candray Escalón'));
    await save();
    expect(await screen.findByRole('alert')).toHaveTextContent('Alguna de las sucursales indicadas no existe.');
    expect(screen.getByRole('button', { name: 'Guardar sucursales' })).toBeEnabled();
  });

  it('si no cargan las sucursales lo dice', async () => {
    server((r) => (r.url === '/sucursales' ? { status: 500, data: { message: 'Fallo interno.' } } : undefined));
    mount();
    await screen.findByText('Marta Doctora');
    await userEvent.click(screen.getByRole('button', { name: 'Sucursales de Marta Doctora' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo interno.');
  });
});

describe('Contraseña de un usuario', () => {
  async function openPassword() {
    const received = server();
    mount();
    await screen.findByText('Marta Doctora');
    await userEvent.click(screen.getByRole('button', { name: 'Contraseña de Marta Doctora' }));
    await screen.findByRole('dialog', { name: 'Nueva contraseña' });
    return received;
  }
  const first = () => screen.getByLabelText(/Contraseña nueva/);
  const second = () => screen.getByLabelText(/Repetir contraseña/);
  const submit = () => userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

  it('rechaza una contraseña corta y una que no coincide, sin llamar al servidor', async () => {
    const received = await openPassword();
    await userEvent.type(first(), 'corta');
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent('al menos 8 caracteres');
    await userEvent.clear(first());
    await userEvent.type(first(), 'clave-nueva-1');
    await userEvent.type(second(), 'clave-nueva-2');
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent('Las contraseñas no coinciden.');
    expect(puts(received)).toHaveLength(0);
  });

  it('envía solo la contraseña, avisa y no la deja en pantalla', async () => {
    const received = await openPassword();
    await userEvent.type(first(), 'clave-nueva-1');
    await userEvent.type(second(), 'clave-nueva-1');
    await submit();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(puts(received)[0]).toMatchObject({ url: '/usuarios/u2/contrasena', body: { password: 'clave-nueva-1' } });
    expect(screen.getByRole('status')).toHaveTextContent('Contraseña de Marta Doctora actualizada.');
    expect(document.body).not.toHaveTextContent('clave-nueva-1');
  });

  it('los campos son de contraseña (no se ve lo escrito) y no se autocompletan', async () => {
    await openPassword();
    expect(first()).toHaveAttribute('type', 'password');
    expect(second()).toHaveAttribute('type', 'password');
    expect(first()).toHaveAttribute('autocomplete', 'new-password');
  });

  it('muestra el error del servidor', async () => {
    server((r) => (r.method === 'put' ? { status: 404, data: { message: 'Usuario no encontrado.' } } : undefined));
    mount();
    await screen.findByText('Marta Doctora');
    await userEvent.click(screen.getByRole('button', { name: 'Contraseña de Marta Doctora' }));
    await userEvent.type(await screen.findByLabelText(/Contraseña nueva/), 'clave-nueva-1');
    await userEvent.type(screen.getByLabelText(/Repetir contraseña/), 'clave-nueva-1');
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario no encontrado.');
    expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeEnabled(); // se puede corregir y reintentar
  });
});

describe('Desbloquear una cuenta', () => {
  it('el botón solo aparece en las cuentas bloqueadas', async () => {
    server();
    mount();
    await screen.findByText('Raúl Recepción');
    expect(within(row('Raúl Recepción')).getByRole('button', { name: 'Desbloquear a Raúl Recepción' })).toBeInTheDocument();
    expect(within(row('Marta Doctora')).queryByRole('button', { name: /Desbloquear/ })).not.toBeInTheDocument();
  });

  it('pide confirmación y al confirmar desbloquea y avisa', async () => {
    const received = server();
    mount();
    await screen.findByText('Raúl Recepción');
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear a Raúl Recepción' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Desbloquear cuenta' });
    expect(received.some((r) => r.url.endsWith('/desbloquear'))).toBe(false); // todavía nada
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desbloquear' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(received.find((r) => r.url.endsWith('/desbloquear'))).toMatchObject({ method: 'post', url: '/usuarios/u3/desbloquear' });
    expect(screen.getByRole('status')).toHaveTextContent('La cuenta de Raúl Recepción fue desbloqueada.');
  });

  it('después de desbloquear se vuelve a pedir la lista (para quitar la etiqueta "Bloqueado")', async () => {
    const received = server();
    mount();
    await screen.findByText('Raúl Recepción');
    const before = usersGets(received).length;
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear a Raúl Recepción' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Desbloquear' }));
    await waitFor(() => expect(usersGets(received).length).toBe(before + 1));
  });

  it('Cancelar no desbloquea', async () => {
    const received = server();
    mount();
    await screen.findByText('Raúl Recepción');
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear a Raúl Recepción' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(received.some((r) => r.url.endsWith('/desbloquear'))).toBe(false);
  });

  it('el desbloqueo es una acción normal, no destructiva: botón primario', async () => {
    server();
    mount();
    await screen.findByText('Raúl Recepción');
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear a Raúl Recepción' }));
    expect(await screen.findByRole('button', { name: 'Desbloquear' })).toHaveClass('bg-marca');
  });

  it('si el servidor falla muestra el error en la página', async () => {
    server((r) => (r.url.endsWith('/desbloquear') ? { status: 404, data: { message: 'Usuario no encontrado.' } } : undefined));
    mount();
    await screen.findByText('Raúl Recepción');
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear a Raúl Recepción' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Desbloquear' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario no encontrado.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
