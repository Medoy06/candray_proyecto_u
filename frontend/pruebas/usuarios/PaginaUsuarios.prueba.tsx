// =============================================================================
// PaginaUsuarios.prueba.tsx
// Qué prueba:   la pantalla de usuarios de punta a punta con una API falsa:
//               lista, filtros, errores y reintento, crear (validación y error
//               del servidor), editar (solo lo cambiado), y activar/desactivar
//               con confirmación.
// Cómo:         cliente real + ayudas/apiFalsa.ts; los datos y el servidor de
//               ejemplo están en ayudas/datosUsuarios.ts (usuario actual "u1").
// =============================================================================
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ManagedUser } from '../../src/servicios/usuarios';
import { installFakeApi } from '../ayudas/apiFalsa';
import { CENTRAL, ESCALON } from '../ayudas/datosSesion';
import { DOCTOR, LOCKED, mount, row, server, usersGets } from '../ayudas/datosUsuarios';

const dlg = () => within(screen.getByRole('dialog'));
const nameField = () => dlg().getByRole('textbox', { name: 'Nombre completo' });
const emailField = () => dlg().getByRole('textbox', { name: 'Correo' });
const roleField = () => dlg().getByRole('combobox', { name: 'Rol' });

describe('PaginaUsuarios — lista', () => {
  it('muestra a los usuarios con rol, sucursales, estado y último acceso', async () => {
    server();
    mount();
    await screen.findByText('Marta Doctora');
    const doctor = within(row('Marta Doctora'));
    expect(doctor.getByText('Médico')).toBeInTheDocument();
    expect(doctor.getByText('Candray Central, Candray Escalón')).toBeInTheDocument();
    expect(doctor.getByText('Activo')).toBeInTheDocument();
    expect(doctor.getByText('Nunca')).toBeInTheDocument();
  });

  it('el administrador ve "Todas" las sucursales y quien no tiene dice "Sin sucursales"', async () => {
    server();
    mount();
    await screen.findByText('Alejandro Mejía');
    expect(within(row('Alejandro Mejía')).getByText('Todas')).toBeInTheDocument();
    expect(within(row('Raúl Recepción')).getByText('Sin sucursales')).toBeInTheDocument();
  });

  it('marca Inactivo y Bloqueado con texto, no solo con color', async () => {
    server();
    mount();
    await screen.findByText('Raúl Recepción');
    const raul = within(row('Raúl Recepción'));
    expect(raul.getByText('Inactivo')).toBeInTheDocument();
    expect(raul.getByText('Bloqueado')).toBeInTheDocument();
  });

  it('en la fila propia dice "(usted)" y no ofrece desactivar', async () => {
    server();
    mount();
    await screen.findByText('Alejandro Mejía');
    const self = within(row('Alejandro Mejía'));
    expect(self.getByText('(usted)')).toBeInTheDocument();
    expect(self.getByRole('button', { name: 'Editar a Alejandro Mejía' })).toBeInTheDocument();
    expect(self.queryByRole('button', { name: /Desactivar/ })).not.toBeInTheDocument();
  });

  it('un usuario inactivo ofrece "Activar"', async () => {
    server();
    mount();
    await screen.findByText('Raúl Recepción');
    expect(within(row('Raúl Recepción')).getByRole('button', { name: 'Activar a Raúl Recepción' })).toBeInTheDocument();
  });

  it('la tabla va dentro de un contenedor con desplazamiento horizontal (no se corta en ventanas angostas)', async () => {
    server();
    mount();
    await screen.findByText('Marta Doctora');
    expect(screen.getByRole('table').parentElement).toHaveClass('overflow-x-auto');
  });

  it('sin resultados lo dice en vez de mostrar una tabla vacía', async () => {
    server((r) => (r.url === '/usuarios' && r.method === 'get' ? { status: 200, data: { data: [] } } : undefined));
    mount();
    await screen.findByText(/No hay usuarios que coincidan/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('si falla la carga muestra el error del servidor y permite reintentar', async () => {
    let fail = true;
    server((r) =>
      r.url === '/usuarios' && r.method === 'get' && fail ? { status: 500, data: { message: 'Fallo interno.' } } : undefined,
    );
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo interno.');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Marta Doctora');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('PaginaUsuarios — carga con filtros cambiantes', () => {
  // Una API donde cada consulta de la lista se resuelve "a mano", cuando la prueba lo decide.
  function manualServer() {
    const pending: { role?: string; resolve: (users: ManagedUser[]) => void }[] = [];
    installFakeApi((request) => {
      if (request.url === '/usuarios' && request.method === 'get') {
        return new Promise((resolve) => {
          pending.push({
            role: request.params?.role as string | undefined,
            resolve: (users) => resolve({ status: 200, data: { data: users } }),
          });
        });
      }
      return { status: 404 };
    });
    return pending;
  }

  it('una respuesta lenta y vieja NO pisa a la más reciente', async () => {
    const pending = manualServer();
    mount();
    await waitFor(() => expect(pending).toHaveLength(1)); // consulta inicial (sin filtros)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rol' }), 'doctor');
    await waitFor(() => expect(pending).toHaveLength(2)); // consulta con rol=doctor
    pending[1].resolve([DOCTOR]); // llega primero la nueva
    await screen.findByText('Marta Doctora');
    pending[0].resolve([LOCKED]); // llega tarde la vieja
    await waitFor(() => expect(screen.queryByText('Raúl Recepción')).not.toBeInTheDocument());
    expect(screen.getByText('Marta Doctora')).toBeInTheDocument();
  });

  it('mientras se recarga con otro filtro, la lista anterior sigue visible (no parpadea)', async () => {
    const pending = manualServer();
    mount();
    await waitFor(() => expect(pending).toHaveLength(1));
    pending[0].resolve([DOCTOR]);
    await screen.findByText('Marta Doctora');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'activos');
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(screen.getByText('Marta Doctora')).toBeInTheDocument(); // sigue ahí mientras llega la nueva
    expect(screen.queryByText('Cargando usuarios...')).not.toBeInTheDocument();
    pending[1].resolve([LOCKED]);
    await screen.findByText('Raúl Recepción');
  });
});

describe('PaginaUsuarios — filtros', () => {
  it('el rol y el estado se envían al servidor', async () => {
    const received = server();
    mount();
    await screen.findByText('Marta Doctora');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rol' }), 'doctor');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'inactivos');
    await waitFor(() => expect(usersGets(received).at(-1)?.params).toEqual({ role: 'doctor', is_active: 'false' }));
  });

  it('la búsqueda espera a que se deje de escribir: una sola consulta, no una por letra', async () => {
    const received = server();
    mount();
    await screen.findByText('Marta Doctora');
    const before = usersGets(received).length;
    await userEvent.type(screen.getByLabelText('Buscar'), 'marta');
    await waitFor(() => expect(usersGets(received).at(-1)?.params).toEqual({ search: 'marta' }));
    expect(usersGets(received).length).toBe(before + 1);
  });
});

describe('PaginaUsuarios — crear', () => {
  async function openCreate() {
    const received = server();
    mount();
    await screen.findByText('Marta Doctora');
    await userEvent.click(screen.getByRole('button', { name: /Nuevo usuario/ }));
    return { received, dialog: await screen.findByRole('dialog', { name: 'Nuevo usuario' }) };
  }
  const submit = () => userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));

  it('el botón principal de la ventana usa el estilo primario (rojo de marca)', async () => {
    await openCreate();
    expect(screen.getByRole('button', { name: 'Crear usuario' })).toHaveClass('bg-marca');
    expect(screen.getByRole('button', { name: 'Cancelar' })).not.toHaveClass('bg-marca');
  });

  it('ofrece solo las sucursales activas', async () => {
    const { dialog } = await openCreate();
    await within(dialog).findByLabelText('Candray Central');
    expect(within(dialog).getByLabelText('Candray Escalón')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Metrosur')).not.toBeInTheDocument();
  });

  it('valida en pantalla, sin llamar al servidor', async () => {
    const { received } = await openCreate();
    const posts = () => received.filter((r) => r.method === 'post');
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent('Escriba el nombre completo');
    await userEvent.type(nameField(), 'Nuevo Usuario');
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent('Escriba un correo válido');
    await userEvent.type(emailField(), 'nuevo@candray.test');
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent('al menos 8 caracteres');
    await userEvent.type(screen.getByLabelText(/Contraseña inicial/), 'clave-larga-1');
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent('necesita al menos una sucursal');
    expect(posts()).toHaveLength(0);
  });

  it('crea a un recepcionista con sucursales y la predeterminada, y refresca la lista', async () => {
    const { received } = await openCreate();
    await userEvent.type(nameField(), '  Nuevo Usuario ');
    await userEvent.type(emailField(), 'nuevo@candray.test');
    await userEvent.type(screen.getByLabelText(/Contraseña inicial/), 'clave-larga-1');
    await userEvent.click(await screen.findByLabelText('Candray Central'));
    await userEvent.click(screen.getByLabelText('Candray Escalón'));
    await userEvent.click(screen.getByLabelText('Sucursal predeterminada: Candray Escalón'));
    await submit();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(received.find((r) => r.method === 'post')?.body).toEqual({
      full_name: 'Nuevo Usuario',
      email: 'nuevo@candray.test',
      password: 'clave-larga-1',
      role: 'recepcionista',
      branch_ids: [CENTRAL.id, ESCALON.id],
      default_branch_id: ESCALON.id,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Usuario Marta Doctora creado.');
    await waitFor(() => expect(usersGets(received).length).toBeGreaterThanOrEqual(2));
  });

  it('un administrador no necesita sucursales: se envía una lista vacía', async () => {
    const { received } = await openCreate();
    await userEvent.type(nameField(), 'Otra Admin');
    await userEvent.type(emailField(), 'otra@candray.test');
    await userEvent.type(screen.getByLabelText(/Contraseña inicial/), 'clave-larga-1');
    // Primero se marca una sucursal como recepcionista y DESPUÉS se cambia a administrador:
    // aunque la selección siga en memoria, no debe enviarse.
    await userEvent.click(await screen.findByLabelText('Candray Central'));
    await userEvent.selectOptions(roleField(), 'admin');
    expect(screen.getByText(/no hace falta asignarlas/)).toBeInTheDocument();
    await submit();
    await waitFor(() => expect(received.some((r) => r.method === 'post')).toBe(true));
    const body = received.find((r) => r.method === 'post')?.body as Record<string, unknown>;
    expect(body.branch_ids).toEqual([]);
    expect(body).not.toHaveProperty('default_branch_id');
  });

  it('si el servidor rechaza (correo repetido) muestra su mensaje y deja la ventana abierta', async () => {
    const received = server((r) =>
      r.method === 'post' ? { status: 409, data: { message: 'Ya existe un usuario con ese correo.' } } : undefined,
    );
    mount();
    await screen.findByText('Marta Doctora');
    await userEvent.click(screen.getByRole('button', { name: /Nuevo usuario/ }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Nombre completo' }), 'Repetida');
    await userEvent.type(emailField(), 'marta@candray.test');
    await userEvent.type(screen.getByLabelText(/Contraseña inicial/), 'clave-larga-1');
    await userEvent.selectOptions(roleField(), 'directivo');
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un usuario con ese correo.');
    expect(screen.getByRole('dialog', { name: 'Nuevo usuario' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear usuario' })).toBeEnabled(); // se puede corregir y reintentar
    expect(received.filter((r) => r.method === 'post')).toHaveLength(1);
  });

  it('Cancelar cierra sin enviar nada', async () => {
    const { received } = await openCreate();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(received.some((r) => r.method === 'post')).toBe(false);
  });
});

describe('PaginaUsuarios — editar', () => {
  async function openEdit(name = 'Marta Doctora') {
    const received = server();
    mount();
    await screen.findByText(name);
    await userEvent.click(screen.getByRole('button', { name: `Editar a ${name}` }));
    return { received, dialog: await screen.findByRole('dialog', { name: 'Editar usuario' }) };
  }
  const save = () => userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

  it('muestra los datos actuales y el correo solo de lectura', async () => {
    await openEdit();
    expect(nameField()).toHaveValue('Marta Doctora');
    expect(emailField()).toBeDisabled();
    expect(roleField()).toHaveValue('doctor');
  });

  it('sin cambios no llama al servidor', async () => {
    const { received } = await openEdit();
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent('No hay cambios que guardar.');
    expect(received.some((r) => r.method === 'patch')).toBe(false);
  });

  it('envía solo lo que cambió', async () => {
    const { received } = await openEdit();
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'Marta Oftalmóloga');
    await save();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(received.find((r) => r.method === 'patch')).toMatchObject({ url: '/usuarios/u2', body: { full_name: 'Marta Oftalmóloga' } });
    expect(screen.getByRole('status')).toHaveTextContent('Cambios guardados');
  });

  it('puede cambiar el rol de otra persona', async () => {
    const { received } = await openEdit();
    await userEvent.selectOptions(roleField(), 'directivo');
    await save();
    await waitFor(() => expect(received.some((r) => r.method === 'patch')).toBe(true));
    expect(received.find((r) => r.method === 'patch')?.body).toEqual({ role: 'directivo' });
  });

  it('el rol propio está bloqueado, con su explicación', async () => {
    await openEdit('Alejandro Mejía');
    expect(roleField()).toBeDisabled();
    expect(screen.getByText('No puede cambiar su propio rol.')).toBeInTheDocument();
  });

  it('un nombre demasiado corto se rechaza en pantalla', async () => {
    const { received } = await openEdit();
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'A');
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent('mínimo 2 caracteres');
    expect(received.some((r) => r.method === 'patch')).toBe(false);
  });

  it('muestra el error del servidor y deja reintentar', async () => {
    const received = server((r) => (r.method === 'patch' ? { status: 403, data: { message: 'No puede cambiar su propio rol ni desactivar su propia cuenta.' } } : undefined));
    mount();
    await screen.findByText('Marta Doctora');
    await userEvent.click(screen.getByRole('button', { name: 'Editar a Marta Doctora' }));
    await screen.findByRole('dialog', { name: 'Editar usuario' });
    await userEvent.selectOptions(roleField(), 'admin');
    await save();
    expect(await screen.findByRole('alert')).toHaveTextContent('No puede cambiar su propio rol');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
    expect(received.filter((r) => r.method === 'patch')).toHaveLength(1);
  });
});

describe('PaginaUsuarios — activar y desactivar', () => {
  it('pide confirmación y, al confirmar, desactiva', async () => {
    const received = server();
    mount();
    await screen.findByText('Marta Doctora');
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar a Marta Doctora' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Desactivar usuario' });
    // Desactivar es destructivo: el botón de confirmar va en estilo de peligro (borde rojo).
    expect(within(dialog).getByRole('button', { name: 'Desactivar' })).toHaveClass('border-marca');
    expect(received.some((r) => r.method === 'patch')).toBe(false); // todavía nada
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(received.find((r) => r.method === 'patch')).toMatchObject({ url: '/usuarios/u2', body: { is_active: false } });
    expect(screen.getByRole('status')).toHaveTextContent('Marta Doctora fue desactivado.');
  });

  it('Cancelar no cambia nada', async () => {
    const received = server();
    mount();
    await screen.findByText('Marta Doctora');
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar a Marta Doctora' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(received.some((r) => r.method === 'patch')).toBe(false);
  });

  it('activar a un inactivo envía is_active true', async () => {
    const received = server();
    mount();
    await screen.findByText('Raúl Recepción');
    await userEvent.click(screen.getByRole('button', { name: 'Activar a Raúl Recepción' }));
    const confirm = await screen.findByRole('button', { name: 'Activar' });
    expect(confirm).toHaveClass('bg-marca'); // activar no es destructivo: botón primario
    await userEvent.click(confirm);
    await waitFor(() => expect(received.some((r) => r.method === 'patch')).toBe(true));
    expect(received.find((r) => r.method === 'patch')?.body).toEqual({ is_active: true });
    expect(await screen.findByText('Raúl Recepción fue activado.')).toBeInTheDocument();
  });

  it('si el servidor lo rechaza (último administrador) muestra el error en la página', async () => {
    server((r) =>
      r.method === 'patch' ? { status: 409, data: { message: 'Debe quedar al menos un administrador activo.' } } : undefined,
    );
    mount();
    await screen.findByText('Marta Doctora');
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar a Marta Doctora' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Debe quedar al menos un administrador activo.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
