// =============================================================================
// PaginaPacientes.prueba.tsx
// Qué prueba:   la pantalla de pacientes de punta a punta con una API falsa:
//               lista, búsqueda, desactivados, páginas, errores y reintento,
//               registrar (validación y error del servidor), editar (solo lo
//               cambiado), activar/desactivar con confirmación, y que quien solo
//               consulta no vea ningún botón de modificar.
// Cómo:         cliente real + ayudas/apiFalsa.ts; sesión de ayudas/conSesion.tsx.
// =============================================================================
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useParams } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PaginaPacientes } from '../../src/paginas/pacientes/PaginaPacientes';
import type { Patient } from '../../src/servicios/pacientes';
import { todayText } from '../../src/utilidades/fechaLocal';
import { installFakeApi, type RecordedRequest } from '../ayudas/apiFalsa';
import { renderConSesion } from '../ayudas/conSesion';

const ANA: Patient = {
  id: 'p1', record_number: 101, full_name: 'Ana Pérez', birth_date: '1990-05-20', phone: '7000-1111',
  dui: '01234567-8', email: 'ana@correo.com', is_active: true, created_at: '', updated_at: '',
};
const LUIS: Patient = {
  ...ANA, id: 'p2', record_number: 102, full_name: 'Luis Gómez', birth_date: '1975-12-01', phone: '7222-3333',
  dui: null, email: null,
};
const SOFIA: Patient = { ...ANA, id: 'p3', record_number: 103, full_name: 'Sofía Rivas', is_active: false };

const pagination = (page = 1, totalPages = 1, total = 3) => ({ page, page_size: 25, total, total_pages: totalPages });

type Reply = { status: number; data?: unknown } | undefined;
function server(overrides: (request: RecordedRequest) => Reply = () => undefined) {
  return installFakeApi((request) => {
    const custom = overrides(request);
    if (custom !== undefined) return custom;
    if (request.method === 'get' && request.url === '/pacientes') {
      return { status: 200, data: { data: [ANA, LUIS, SOFIA], pagination: pagination() } };
    }
    if (request.method === 'post' && request.url === '/pacientes') {
      return { status: 201, data: { data: { ...ANA, id: 'nuevo', full_name: 'Marta Nueva' } } };
    }
    if (request.method === 'patch') return { status: 200, data: { data: ANA } };
    return { status: 404 };
  });
}

const RECEPCION = { role: 'recepcionista' as const, capabilities: ['patients_search', 'patients_manage'] as const };
const mount = () => renderConSesion(<PaginaPacientes />, { role: RECEPCION.role, capabilities: [...RECEPCION.capabilities] });
const mountSoloConsulta = () => renderConSesion(<PaginaPacientes />, { role: 'doctor', capabilities: ['patients_search'] });
const row = (name: string) => screen.getByText(name).closest('tr')!;
const dlg = () => within(screen.getByRole('dialog'));
const getsOf = (received: RecordedRequest[]) => received.filter((r) => r.method === 'get' && r.url === '/pacientes');
const writes = (received: RecordedRequest[], method: string) => received.filter((r) => r.method === method);

async function fillNewPatient(overrides: { name?: string; birth?: string; phone?: string } = {}) {
  await userEvent.click(screen.getByRole('button', { name: /Nuevo paciente/ }));
  await userEvent.type(dlg().getByRole('textbox', { name: /Nombre completo/ }), overrides.name ?? 'Marta Nueva');
  fireEvent.change(dlg().getByLabelText(/Fecha de nacimiento/), { target: { value: overrides.birth ?? '1988-03-09' } });
  await userEvent.type(dlg().getByLabelText(/Teléfono/), overrides.phone ?? '7555-4444');
}

describe('PaginaPacientes — lista', () => {
  it('muestra expediente, nombre, correo, nacimiento, teléfono, DUI y estado', async () => {
    server();
    mount();
    await screen.findByText('Ana Pérez');
    const ana = within(row('Ana Pérez'));
    expect(ana.getByText('101')).toBeInTheDocument();
    expect(ana.getByText('ana@correo.com')).toBeInTheDocument();
    expect(ana.getByText('20/05/1990')).toBeInTheDocument();
    expect(ana.getByText('7000-1111')).toBeInTheDocument();
    expect(ana.getByText('01234567-8')).toBeInTheDocument();
    expect(ana.getByText('Activo')).toBeInTheDocument();
    expect(within(row('Sofía Rivas')).getByText('Desactivado')).toBeInTheDocument();
  });

  it('lo que falta se dice con palabras, no queda en blanco', async () => {
    server();
    mount();
    await screen.findByText('Luis Gómez');
    const luis = within(row('Luis Gómez'));
    expect(luis.getByText('Sin DUI')).toBeInTheDocument();
    expect(luis.getByText('Sin correo')).toBeInTheDocument();
  });

  it('la tabla tiene nombre accesible', async () => {
    server();
    mount();
    await screen.findByText('Ana Pérez');
    expect(screen.getByRole('table', { name: 'Lista de pacientes' })).toBeInTheDocument();
  });

  it('pide la primera página sin búsqueda ni desactivados', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    expect(getsOf(received)[0].params).toEqual({ page: 1, page_size: 25 });
  });

  it('mientras carga lo dice, y sin pacientes lo explica', async () => {
    server((request) =>
      request.url === '/pacientes' ? { status: 200, data: { data: [], pagination: pagination(1, 0, 0) } } : undefined,
    );
    mount();
    expect(screen.getByText('Cargando pacientes...')).toBeInTheDocument();
    expect(await screen.findByText('Todavía no hay pacientes registrados.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('un error muestra el mensaje del servidor y Reintentar vuelve a pedir la lista', async () => {
    let fail = true;
    const received = server((request) => {
      if (request.url === '/pacientes' && fail) return { status: 500, data: { message: 'Falla de prueba.' } };
      return undefined;
    });
    mount();
    expect(await screen.findByText('Falla de prueba.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Ana Pérez');
    expect(getsOf(received)).toHaveLength(2);
    expect(screen.queryByText('Falla de prueba.')).not.toBeInTheDocument();
  });
});

describe('PaginaPacientes — búsqueda y páginas', () => {
  it('buscar envía q (tras la pausa) y vuelve a la página 1', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.type(screen.getByLabelText('Buscar paciente'), 'ana');
    await waitFor(() => expect(getsOf(received).at(-1)?.params).toEqual({ page: 1, page_size: 25, q: 'ana' }));
  });

  it('no consulta por cada letra: espera a que la persona haga una pausa', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    const before = getsOf(received).length;
    await userEvent.type(screen.getByLabelText('Buscar paciente'), 'abcd');
    await waitFor(() => expect(getsOf(received).at(-1)?.params).toMatchObject({ q: 'abcd' }));
    expect(getsOf(received).length - before).toBe(1);
  });

  it('los espacios de los lados no cuentan como búsqueda', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.type(screen.getByLabelText('Buscar paciente'), '   ');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(getsOf(received)).toHaveLength(1);
  });

  it('sin resultados de una búsqueda lo dice distinto a "no hay pacientes"', async () => {
    server((request) =>
      request.url === '/pacientes' && request.params?.q === 'zzz'
        ? { status: 200, data: { data: [], pagination: pagination(1, 0, 0) } }
        : undefined,
    );
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.type(screen.getByLabelText('Buscar paciente'), 'zzz');
    expect(await screen.findByText('No hay pacientes que coincidan con la búsqueda.')).toBeInTheDocument();
  });

  it('"Incluir desactivados" envía include_inactive y vuelve a la página 1', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Incluir desactivados' }));
    await waitFor(() =>
      expect(getsOf(received).at(-1)?.params).toEqual({ page: 1, page_size: 25, include_inactive: 'true' }),
    );
  });

  describe('con varias páginas', () => {
    const paged = (request: RecordedRequest): Reply => {
      if (request.url !== '/pacientes' || request.method !== 'get') return undefined;
      const page = Number(request.params?.page);
      const patient = { ...ANA, id: `pg${page}`, full_name: `Paciente de la página ${page}` };
      return { status: 200, data: { data: [patient], pagination: pagination(page, 3, 60) } };
    };

    it('muestra el resumen y navega con Siguiente y Anterior', async () => {
      const received = server(paged);
      mount();
      await screen.findByText('Paciente de la página 1');
      expect(screen.getByRole('navigation', { name: 'Paginación' })).toHaveTextContent('Página 1 de 3 · 60 pacientes');
      await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
      await screen.findByText('Paciente de la página 2');
      expect(getsOf(received).at(-1)?.params).toMatchObject({ page: 2 });
      await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
      await screen.findByText('Paciente de la página 1');
    });

    it('mientras llega otra página los botones de página se apagan', async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const received = installFakeApi(async (request) => {
        if (request.method !== 'get') return { status: 404 };
        const page = Number(request.params?.page);
        if (page === 2) await gate; // la segunda página tarda
        const patient = { ...ANA, id: `pg${page}`, full_name: `Paciente de la página ${page}` };
        return { status: 200, data: { data: [patient], pagination: pagination(page, 3, 60) } };
      });
      mount();
      await screen.findByText('Paciente de la página 1');
      await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
      await waitFor(() => expect(getsOf(received)).toHaveLength(2));
      expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
      release();
      await screen.findByText('Paciente de la página 2');
      expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled();
    });

    it('al cambiar la búsqueda vuelve a la página 1', async () => {
      const received = server(paged);
      mount();
      await screen.findByText('Paciente de la página 1');
      await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
      await screen.findByText('Paciente de la página 2');
      await userEvent.click(screen.getByRole('checkbox', { name: 'Incluir desactivados' }));
      await waitFor(() => expect(getsOf(received).at(-1)?.params).toMatchObject({ page: 1, include_inactive: 'true' }));
    });
  });
});

describe('PaginaPacientes — quién ve qué', () => {
  it('recepción ve "Nuevo paciente" y los botones de cada fila', async () => {
    server();
    mount();
    await screen.findByText('Ana Pérez');
    expect(screen.getByRole('button', { name: /Nuevo paciente/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar a Ana Pérez' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desactivar a Ana Pérez' })).toHaveClass('border-marca');
    expect(screen.getByRole('button', { name: 'Activar a Sofía Rivas' })).not.toHaveClass('border-marca');
  });

  it('quien solo consulta (doctor) ve la lista, pero ningún botón de modificar', async () => {
    server();
    mountSoloConsulta();
    await screen.findByText('Ana Pérez');
    expect(screen.queryByRole('button', { name: /Nuevo paciente/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar a/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Desactivar a|Activar a/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Acciones' })).not.toBeInTheDocument();
  });
});

// Destino de prueba: dice de qué paciente es la dirección a la que se llegó.
function DestinoExpediente() {
  const { patientId } = useParams();
  return <p>Pantalla del expediente de {patientId}</p>;
}

describe('PaginaPacientes — expediente clínico', () => {
  const mountMedico = () =>
    renderConSesion(
      <Routes>
        <Route path="/pacientes" element={<PaginaPacientes />} />
        <Route path="/pacientes/:patientId/expediente" element={<DestinoExpediente />} />
      </Routes>,
      { role: 'doctor', capabilities: ['patients_search', 'medical_records_read'], route: '/pacientes' },
    );

  it('quien puede leer expedientes (médico) ve "Expediente" en cada fila, pero ningún botón de modificar', async () => {
    server();
    mountMedico();
    await screen.findByText('Ana Pérez');
    expect(screen.getByRole('columnheader', { name: 'Acciones' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir el expediente de Ana Pérez' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Abrir el expediente de/ })).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Editar a|Desactivar a|Activar a/ })).not.toBeInTheDocument();
  });

  it('al pulsarlo abre el expediente de ESE paciente', async () => {
    server();
    mountMedico();
    await screen.findByText('Luis Gómez');
    await userEvent.click(screen.getByRole('button', { name: 'Abrir el expediente de Luis Gómez' }));
    expect(await screen.findByText('Pantalla del expediente de p2')).toBeInTheDocument();
  });

  it('recepción no ve el botón "Expediente" (no tiene la capacidad), pero sí los suyos', async () => {
    server();
    mount();
    await screen.findByText('Ana Pérez');
    expect(screen.queryByRole('button', { name: /Abrir el expediente/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar a Ana Pérez' })).toBeInTheDocument();
  });
});

describe('PaginaPacientes — registrar', () => {
  it('registra con los datos mínimos, manda null en DUI y correo, avisa y recarga la lista', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    await fillNewPatient();
    await userEvent.click(dlg().getByRole('button', { name: 'Registrar paciente' }));
    await screen.findByText('Paciente Marta Nueva registrado.');
    expect(writes(received, 'post')[0].body).toEqual({
      full_name: 'Marta Nueva', birth_date: '1988-03-09', phone: '7555-4444', dui: null, email: null,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(getsOf(received)).toHaveLength(2));
  });

  it('envía también el DUI y el correo cuando se escriben', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    await fillNewPatient();
    await userEvent.type(dlg().getByRole('textbox', { name: /DUI/ }), '01234567-8');
    await userEvent.type(dlg().getByRole('textbox', { name: /Correo/ }), 'Marta@Correo.com');
    await userEvent.click(dlg().getByRole('button', { name: 'Registrar paciente' }));
    await screen.findByText('Paciente Marta Nueva registrado.');
    expect(writes(received, 'post')[0].body).toMatchObject({ dui: '01234567-8', email: 'marta@correo.com' });
  });

  it('si falta un dato obligatorio lo explica y NO llama al servidor', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: /Nuevo paciente/ }));
    await userEvent.click(dlg().getByRole('button', { name: 'Registrar paciente' }));
    expect(await dlg().findByText(/Escriba el nombre completo/)).toBeInTheDocument();
    expect(writes(received, 'post')).toHaveLength(0);
  });

  it('una fecha futura se rechaza en el formulario', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    await fillNewPatient({ birth: '2999-01-01' });
    await userEvent.click(dlg().getByRole('button', { name: 'Registrar paciente' }));
    expect(await dlg().findByText(/no puede ser futura/)).toBeInTheDocument();
    expect(writes(received, 'post')).toHaveLength(0);
  });

  it('el error del servidor (DUI repetido) se muestra y la ventana sigue abierta con lo escrito', async () => {
    server((request) =>
      request.method === 'post' ? { status: 409, data: { message: 'Ya existe un paciente con ese DUI.' } } : undefined,
    );
    mount();
    await screen.findByText('Ana Pérez');
    await fillNewPatient();
    await userEvent.click(dlg().getByRole('button', { name: 'Registrar paciente' }));
    expect(await dlg().findByText('Ya existe un paciente con ese DUI.')).toBeInTheDocument();
    expect(dlg().getByRole('textbox', { name: /Nombre completo/ })).toHaveValue('Marta Nueva');
    expect(dlg().getByRole('button', { name: 'Registrar paciente' })).toBeEnabled();
  });

  it('un clic fuera de la ventana NO la cierra (no se pierde lo escrito)', async () => {
    server();
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: /Nuevo paciente/ }));
    await userEvent.type(dlg().getByRole('textbox', { name: /Nombre completo/ }), 'Marta');
    fireEvent.click(screen.getByTestId('fondo-dialogo'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(dlg().getByRole('textbox', { name: /Nombre completo/ })).toHaveValue('Marta');
  });

  it('la fecha de nacimiento solo deja elegir entre 1900-01-01 y hoy', async () => {
    server();
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: /Nuevo paciente/ }));
    const birth = dlg().getByLabelText(/Fecha de nacimiento/);
    expect(birth).toHaveAttribute('min', '1900-01-01');
    expect(birth).toHaveAttribute('max', todayText());
  });

  it('un aviso anterior se quita al abrir otra ventana', async () => {
    server();
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar a Ana Pérez' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }));
    await screen.findByText('Ana Pérez fue desactivado.');
    await userEvent.click(screen.getByRole('button', { name: /Nuevo paciente/ }));
    expect(screen.queryByText('Ana Pérez fue desactivado.')).not.toBeInTheDocument();
  });

  it('Cancelar cierra la ventana sin llamar al servidor', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: /Nuevo paciente/ }));
    await userEvent.click(dlg().getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(writes(received, 'post')).toHaveLength(0);
  });
});

describe('PaginaPacientes — editar', () => {
  async function openEdit(name = 'Ana Pérez') {
    await screen.findByText(name);
    await userEvent.click(screen.getByRole('button', { name: `Editar a ${name}` }));
  }

  it('abre con los datos actuales', async () => {
    server();
    mount();
    await openEdit();
    expect(dlg().getByRole('textbox', { name: /Nombre completo/ })).toHaveValue('Ana Pérez');
    expect(dlg().getByLabelText(/Fecha de nacimiento/)).toHaveValue('1990-05-20');
    expect(dlg().getByLabelText(/Teléfono/)).toHaveValue('7000-1111');
    expect(dlg().getByRole('textbox', { name: /DUI/ })).toHaveValue('01234567-8');
    expect(dlg().getByRole('textbox', { name: /Correo/ })).toHaveValue('ana@correo.com');
  });

  it('envía SOLO el campo cambiado y avisa', async () => {
    const received = server();
    mount();
    await openEdit();
    const phone = dlg().getByLabelText(/Teléfono/);
    await userEvent.clear(phone);
    await userEvent.type(phone, '7999-0000');
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText('Cambios guardados para Ana Pérez.');
    expect(writes(received, 'patch')[0]).toMatchObject({ url: '/pacientes/p1', body: { phone: '7999-0000' } });
    expect(Object.keys(writes(received, 'patch')[0].body as object)).toEqual(['phone']);
  });

  it('borrar el DUI y el correo envía null', async () => {
    const received = server();
    mount();
    await openEdit();
    await userEvent.clear(dlg().getByRole('textbox', { name: /DUI/ }));
    await userEvent.clear(dlg().getByRole('textbox', { name: /Correo/ }));
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText('Cambios guardados para Ana Pérez.');
    expect(writes(received, 'patch')[0].body).toEqual({ dui: null, email: null });
  });

  it('sin cambios lo dice y no llama al servidor', async () => {
    const received = server();
    mount();
    await openEdit();
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar cambios' }));
    expect(await dlg().findByText('No hay cambios que guardar.')).toBeInTheDocument();
    expect(writes(received, 'patch')).toHaveLength(0);
  });

  it('el error del servidor se muestra y la ventana sigue abierta', async () => {
    server((request) => (request.method === 'patch' ? { status: 409, data: { message: 'DUI repetido.' } } : undefined));
    mount();
    await openEdit();
    const phone = dlg().getByLabelText(/Teléfono/);
    await userEvent.clear(phone);
    await userEvent.type(phone, '7999-0000');
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar cambios' }));
    expect(await dlg().findByText('DUI repetido.')).toBeInTheDocument();
  });

  it('cambiar a otro paciente no arrastra los datos del anterior', async () => {
    server();
    mount();
    await openEdit('Ana Pérez');
    await userEvent.click(dlg().getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Editar a Luis Gómez' }));
    expect(dlg().getByRole('textbox', { name: /Nombre completo/ })).toHaveValue('Luis Gómez');
    expect(dlg().getByRole('textbox', { name: /DUI/ })).toHaveValue('');
  });
});

describe('PaginaPacientes — activar y desactivar', () => {
  it('desactivar pide confirmación, envía is_active=false y avisa', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar a Ana Pérez' }));
    const confirm = within(screen.getByRole('alertdialog'));
    expect(confirm.getByText('Desactivar paciente')).toBeInTheDocument();
    expect(confirm.getByRole('button', { name: 'Desactivar' })).toHaveClass('border-marca'); // estilo de peligro
    expect(writes(received, 'patch')).toHaveLength(0); // todavía no se hizo nada
    await userEvent.click(confirm.getByRole('button', { name: 'Desactivar' }));
    await screen.findByText('Ana Pérez fue desactivado.');
    expect(writes(received, 'patch')[0]).toMatchObject({ url: '/pacientes/p1', body: { is_active: false } });
  });

  it('activar envía is_active=true', async () => {
    const received = server();
    mount();
    await screen.findByText('Sofía Rivas');
    await userEvent.click(screen.getByRole('button', { name: 'Activar a Sofía Rivas' }));
    const confirm = within(screen.getByRole('alertdialog'));
    expect(confirm.getByText('Activar paciente')).toBeInTheDocument();
    expect(confirm.getByRole('button', { name: 'Activar' })).not.toHaveClass('border-marca'); // activar no es peligroso
    await userEvent.click(confirm.getByRole('button', { name: 'Activar' }));
    await screen.findByText('Sofía Rivas fue activado.');
    expect(writes(received, 'patch')[0]).toMatchObject({ url: '/pacientes/p3', body: { is_active: true } });
  });

  it('Cancelar en la confirmación no cambia nada', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar a Ana Pérez' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(writes(received, 'patch')).toHaveLength(0);
  });

  it('si el servidor rechaza el cambio, lo dice y la lista no se recarga', async () => {
    const received = server((request) =>
      request.method === 'patch' ? { status: 500, data: { message: 'No se pudo.' } } : undefined,
    );
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar a Ana Pérez' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByText('No se pudo.')).toBeInTheDocument();
    expect(getsOf(received)).toHaveLength(1);
  });
});
