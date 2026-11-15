// =============================================================================
// PaginaCitas.prueba.tsx
// Qué prueba:   la agenda del día de punta a punta con una API falsa: lista,
//               navegación entre días, filtro de estado, páginas, errores, y las
//               acciones de recepción (atendida, no asistió, cancelar con
//               motivo). También que quien solo consulta no vea botones.
// Cómo:         cliente real + ayudas/apiFalsa.ts; sesión de ayudas/conSesion.tsx.
// =============================================================================
import { fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useCitas } from '../../src/ganchos/useCitas';
import { PaginaCitas } from '../../src/paginas/citas/PaginaCitas';
import type { Appointment } from '../../src/servicios/citas';
import { addDays, todayText } from '../../src/utilidades/fechaLocal';
import { installFakeApi, type RecordedRequest } from '../ayudas/apiFalsa';
import { renderConSesion } from '../ayudas/conSesion';
import { CENTRAL, ESCALON } from '../ayudas/datosSesion';

const TODAY = todayText();

const BASE: Appointment = {
  id: 'c1', patient_id: 'p1', patient_name: 'Ana Pérez', patient_record_number: 101, patient_phone: '7000-1111',
  doctor_id: 'd1', doctor_name: 'Dr. Alejandro Mejía', branch_id: CENTRAL.id, branch_code: 'CENTRAL',
  branch_name: 'Candray Central', starts_at: `${TODAY} 08:00:00`, ends_at: `${TODAY} 08:30:00`, status: 'scheduled',
  reason: 'Control de la vista', cancellation_reason: null, created_by: 'u1', created_by_name: 'Marta', created_at: '', updated_at: '',
};
const ANA = BASE;
const LUIS: Appointment = {
  ...BASE, id: 'c2', patient_name: 'Luis Gómez', patient_record_number: 102, reason: null,
  starts_at: `${TODAY} 09:30:00`, ends_at: `${TODAY} 10:00:00`, status: 'completed',
};
const SOFIA: Appointment = {
  ...BASE, id: 'c3', patient_name: 'Sofía Rivas', patient_record_number: 103, doctor_name: 'Dra. Rivas',
  starts_at: `${TODAY} 10:00:00`, ends_at: `${TODAY} 10:30:00`, status: 'cancelled', cancellation_reason: 'El paciente avisó',
};
const PEDRO: Appointment = {
  ...BASE, id: 'c4', patient_name: 'Pedro Ruiz', patient_record_number: 104,
  starts_at: `${TODAY} 11:00:00`, ends_at: `${TODAY} 11:30:00`, status: 'no_show',
};

const pagination = (page = 1, totalPages = 1, total = 4) => ({ page, page_size: 50, total, total_pages: totalPages });

type Reply = { status: number; data?: unknown } | undefined;
function server(overrides: (request: RecordedRequest) => Reply = () => undefined) {
  return installFakeApi((request) => {
    const custom = overrides(request);
    if (custom !== undefined) return custom;
    if (request.method === 'get' && request.url === '/citas') {
      return { status: 200, data: { data: [ANA, LUIS, SOFIA, PEDRO], pagination: pagination() } };
    }
    if (request.method === 'patch') return { status: 200, data: { data: ANA } };
    return { status: 404 };
  });
}

const mount = (options: { branch?: typeof CENTRAL } = {}) =>
  renderConSesion(<PaginaCitas />, {
    role: 'recepcionista',
    capabilities: ['appointments_read', 'appointments_manage'],
    activeBranch: options.branch ?? CENTRAL,
  });
const mountSoloConsulta = () => renderConSesion(<PaginaCitas />, { role: 'doctor', capabilities: ['appointments_read'] });
const row = (name: string) => screen.getByText(name).closest('tr')!;
const getsOf = (received: RecordedRequest[]) => received.filter((r) => r.method === 'get' && r.url === '/citas');
const patchesOf = (received: RecordedRequest[]) => received.filter((r) => r.method === 'patch');

describe('PaginaCitas — agenda', () => {
  it('pide la agenda de hoy en la sucursal activa', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    expect(getsOf(received)[0].params).toEqual({ date: TODAY, branch_id: CENTRAL.id, page: 1, page_size: 50 });
  });

  it('muestra hora, paciente, expediente, teléfono, médico, motivo y estado', async () => {
    server();
    mount();
    await screen.findByText('Ana Pérez');
    const ana = within(row('Ana Pérez'));
    expect(ana.getByText('08:00')).toBeInTheDocument();
    expect(ana.getByText('Expediente 101 · 7000-1111')).toBeInTheDocument();
    expect(ana.getByText('Dr. Alejandro Mejía')).toBeInTheDocument();
    expect(ana.getByText('Control de la vista')).toBeInTheDocument();
    expect(ana.getByText('Programada')).toBeInTheDocument();
    expect(within(row('Luis Gómez')).getByText('Atendida')).toBeInTheDocument();
    expect(within(row('Pedro Ruiz')).getByText('No asistió')).toBeInTheDocument();
  });

  it('lo que falta se dice con palabras y la cancelada muestra su motivo', async () => {
    server();
    mount();
    await screen.findByText('Luis Gómez');
    expect(within(row('Luis Gómez')).getByText('Sin motivo')).toBeInTheDocument();
    const sofia = within(row('Sofía Rivas'));
    expect(sofia.getByText('Cancelada')).toBeInTheDocument();
    expect(sofia.getByText('Cancelada: El paciente avisó')).toBeInTheDocument();
  });

  it('una cancelada sin motivo lo dice', async () => {
    server((request) =>
      request.url === '/citas'
        ? { status: 200, data: { data: [{ ...SOFIA, cancellation_reason: null }], pagination: pagination(1, 1, 1) } }
        : undefined,
    );
    mount();
    expect(await screen.findByText('Cancelada: sin motivo indicado')).toBeInTheDocument();
  });

  it('la tabla tiene nombre accesible y la descripción nombra la sucursal', async () => {
    server();
    mount();
    await screen.findByText('Ana Pérez');
    expect(screen.getByRole('table', { name: 'Agenda de citas' })).toBeInTheDocument();
    expect(screen.getByText(/Agenda de Candray Central/)).toBeInTheDocument();
  });

  it('con otra sucursal activa pide la agenda de esa sucursal', async () => {
    const received = server();
    mount({ branch: ESCALON });
    await screen.findByText('Ana Pérez');
    expect(getsOf(received)[0].params).toMatchObject({ branch_id: ESCALON.id });
  });

  it('mientras carga lo dice, y un día sin citas lo explica', async () => {
    server((request) =>
      request.url === '/citas' ? { status: 200, data: { data: [], pagination: pagination(1, 0, 0) } } : undefined,
    );
    mount();
    expect(screen.getByText('Cargando citas...')).toBeInTheDocument();
    expect(await screen.findByText('No hay citas para este día.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('un error muestra el mensaje del servidor y Reintentar vuelve a pedir', async () => {
    let fail = true;
    const received = server((request) => {
      if (request.url === '/citas' && fail) return { status: 500, data: { message: 'Falla de prueba.' } };
      return undefined;
    });
    mount();
    expect(await screen.findByText('Falla de prueba.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Ana Pérez');
    expect(getsOf(received)).toHaveLength(2);
  });
});

describe('PaginaCitas — agenda del médico', () => {
  const ESCALON_APPT: Appointment = { ...ANA, id: 'c9', patient_name: 'Rosa Mena', branch_id: ESCALON.id, branch_name: 'Candray Escalón' };
  const doctorServer = () =>
    server((request) =>
      request.method === 'get' && request.url === '/citas'
        ? { status: 200, data: { data: [ANA, ESCALON_APPT], pagination: pagination(1, 1, 2) } }
        : undefined,
    );

  it('pide sus citas de todas las sucursales (sin branch_id), aunque esté trabajando en una', async () => {
    const received = doctorServer();
    mountSoloConsulta();
    await screen.findByText('Rosa Mena');
    expect(getsOf(received)[0].params).toEqual({ date: TODAY, page: 1, page_size: 50 });
  });

  it('explica que es de todas sus sucursales y agrega la columna Sucursal en lugar de Médico', async () => {
    doctorServer();
    mountSoloConsulta();
    await screen.findByText('Rosa Mena');
    expect(screen.getByText(/Sus citas del día en todas sus sucursales/)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Sucursal' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Médico' })).not.toBeInTheDocument();
    expect(within(row('Rosa Mena')).getByText('Candray Escalón')).toBeInTheDocument();
    expect(within(row('Ana Pérez')).getByText('Candray Central')).toBeInTheDocument();
  });

  it('recepción, en cambio, ve la columna Médico y no la de Sucursal', async () => {
    server();
    mount();
    await screen.findByText('Ana Pérez');
    expect(screen.getByRole('columnheader', { name: 'Médico' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Sucursal' })).not.toBeInTheDocument();
  });
});

describe('PaginaCitas — fecha y estado', () => {
  it('muestra el día de la semana de la fecha elegida', async () => {
    server();
    mount();
    await screen.findByText('Ana Pérez');
    const day = new Intl.DateTimeFormat('es-SV', { timeZone: 'UTC', weekday: 'long' }).format(new Date(`${TODAY}T00:00:00Z`));
    expect(screen.getByText(day)).toBeInTheDocument();
  });

  it('"Día siguiente" y "Día anterior" cambian la fecha pedida', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
    await waitFor(() => expect(getsOf(received).at(-1)?.params).toMatchObject({ date: addDays(TODAY, 1) }));
    await userEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
    await waitFor(() => expect(getsOf(received).at(-1)?.params).toMatchObject({ date: addDays(TODAY, -1) }));
  });

  it('"Hoy" vuelve al día de hoy y está apagado cuando ya se está en hoy', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    expect(screen.getByRole('button', { name: 'Hoy' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
    expect(screen.getByRole('button', { name: 'Hoy' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    await waitFor(() => expect(getsOf(received).at(-1)?.params).toMatchObject({ date: TODAY }));
  });

  it('elegir el estado lo envía al servidor y el vacío explica distinto', async () => {
    const received = server((request) =>
      request.url === '/citas' && request.params?.status === 'no_show'
        ? { status: 200, data: { data: [], pagination: pagination(1, 0, 0) } }
        : undefined,
    );
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'no_show');
    await waitFor(() => expect(getsOf(received).at(-1)?.params).toMatchObject({ status: 'no_show' }));
    expect(await screen.findByText('No hay citas con ese estado en este día.')).toBeInTheDocument();
  });

  it('si se borra el campo de fecha, se ignora (no se pide una fecha vacía)', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '' } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(getsOf(received)).toHaveLength(1);
    expect(getsOf(received)[0].params).toMatchObject({ date: TODAY });
  });

  it('escribir una fecha en el campo pide esa fecha', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-12-24' } });
    await waitFor(() => expect(getsOf(received).at(-1)?.params).toMatchObject({ date: '2026-12-24' }));
  });

  describe('con varias páginas', () => {
    const paged = (request: RecordedRequest): Reply => {
      if (request.url !== '/citas' || request.method !== 'get') return undefined;
      const page = Number(request.params?.page);
      return { status: 200, data: { data: [{ ...ANA, id: `pg${page}`, patient_name: `Paciente ${page}` }], pagination: pagination(page, 3, 120) } };
    };

    it('mientras llega otra página los botones de página se apagan', async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const received = installFakeApi(async (request) => {
        const page = Number(request.params?.page);
        if (page === 2) await gate; // la segunda página tarda
        return { status: 200, data: { data: [{ ...ANA, id: `pg${page}`, patient_name: `Paciente ${page}` }], pagination: pagination(page, 3, 120) } };
      });
      mount();
      await screen.findByText('Paciente 1');
      await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
      await waitFor(() => expect(getsOf(received)).toHaveLength(2));
      expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
      release();
      await screen.findByText('Paciente 2');
      expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled();
    });

    it('muestra el resumen y navega; al cambiar la fecha o el estado vuelve a la página 1', async () => {
      const received = server(paged);
      mount();
      await screen.findByText('Paciente 1');
      expect(screen.getByRole('navigation', { name: 'Paginación' })).toHaveTextContent('Página 1 de 3 · 120 citas');
      await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
      await screen.findByText('Paciente 2');
      await userEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
      await waitFor(() => expect(getsOf(received).at(-1)?.params).toMatchObject({ page: 1, date: addDays(TODAY, 1) }));
      await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
      await waitFor(() => expect(getsOf(received).at(-1)?.params).toMatchObject({ page: 2 }));
      await userEvent.selectOptions(screen.getByLabelText('Estado'), 'completed');
      await waitFor(() => expect(getsOf(received).at(-1)?.params).toMatchObject({ page: 1, status: 'completed' }));
    });
  });
});

describe('PaginaCitas — quién ve qué', () => {
  it('recepción ve acciones solo en las citas programadas', async () => {
    server();
    mount();
    await screen.findByText('Ana Pérez');
    const ana = within(row('Ana Pérez'));
    expect(ana.getByRole('button', { name: /Marcar atendida/ })).toBeInTheDocument();
    expect(ana.getByRole('button', { name: /no asistió/ })).toBeInTheDocument();
    expect(ana.getByRole('button', { name: /Cancelar la cita/ })).toHaveClass('border-marca');
    for (const name of ['Luis Gómez', 'Sofía Rivas', 'Pedro Ruiz']) {
      expect(within(row(name)).queryByRole('button')).not.toBeInTheDocument();
    }
  });

  it('quien solo consulta (doctor) ve la agenda sin ningún botón de acción', async () => {
    server();
    mountSoloConsulta();
    await screen.findByText('Ana Pérez');
    expect(screen.queryByRole('button', { name: /Marcar|asistió|Cancelar la cita/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Acciones' })).not.toBeInTheDocument();
  });
});

describe('PaginaCitas — cambiar el estado', () => {
  it('"Atendida" pide confirmación, envía completed, avisa y recarga', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: /Marcar atendida/ }));
    const confirm = within(screen.getByRole('alertdialog'));
    expect(confirm.getByText('Marcar como atendida')).toBeInTheDocument();
    expect(patchesOf(received)).toHaveLength(0); // todavía no se hizo nada
    await userEvent.click(confirm.getByRole('button', { name: 'Atendida' }));
    await screen.findByText('La cita de Ana Pérez quedó como atendida.');
    expect(patchesOf(received)[0]).toMatchObject({ url: '/citas/c1/estado', body: { status: 'completed' } });
    await waitFor(() => expect(getsOf(received)).toHaveLength(2));
  });

  it('"No asistió" envía no_show y avisa', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: /no asistió/ }));
    const confirm = within(screen.getByRole('alertdialog'));
    expect(confirm.getByText('Marcar como "No asistió"')).toBeInTheDocument();
    await userEvent.click(confirm.getByRole('button', { name: 'No asistió' }));
    await screen.findByText('Se registró que Ana Pérez no asistió.');
    expect(patchesOf(received)[0]).toMatchObject({ url: '/citas/c1/estado', body: { status: 'no_show' } });
  });

  it('Cancelar en la confirmación no cambia nada', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: /Marcar atendida/ }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(patchesOf(received)).toHaveLength(0);
  });

  it('si el servidor rechaza (la cita aún no empieza) muestra su mensaje y no recarga', async () => {
    const received = server((request) =>
      request.method === 'patch' ? { status: 409, data: { message: 'La cita todavía no ha comenzado.' } } : undefined,
    );
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: /Marcar atendida/ }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Atendida' }));
    expect(await screen.findByText('La cita todavía no ha comenzado.')).toBeInTheDocument();
    expect(getsOf(received)).toHaveLength(1);
  });

  it('un aviso anterior se quita al abrir otra confirmación', async () => {
    server();
    mount();
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: /Marcar atendida/ }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Atendida' }));
    await screen.findByText('La cita de Ana Pérez quedó como atendida.');
    await userEvent.click(screen.getByRole('button', { name: /no asistió/ }));
    expect(screen.queryByText('La cita de Ana Pérez quedó como atendida.')).not.toBeInTheDocument();
  });
});

describe('PaginaCitas — cancelar una cita', () => {
  const dlg = () => within(screen.getByRole('dialog'));
  async function openCancel() {
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: /Cancelar la cita/ }));
  }

  it('la ventana dice de quién es la cita', async () => {
    server();
    mount();
    await openCancel();
    expect(dlg().getByText(/Cita de/)).toHaveTextContent('Cita de Ana Pérez con Dr. Alejandro Mejía');
  });

  it('cancela con motivo (sin espacios sobrantes), avisa y recarga', async () => {
    const received = server();
    mount();
    await openCancel();
    await userEvent.type(dlg().getByRole('textbox', { name: /Motivo/ }), '  El paciente avisó  ');
    await userEvent.click(dlg().getByRole('button', { name: 'Cancelar cita' }));
    await screen.findByText('Se canceló la cita de Ana Pérez.');
    expect(patchesOf(received)[0]).toMatchObject({
      url: '/citas/c1/estado',
      body: { status: 'cancelled', cancellation_reason: 'El paciente avisó' },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(getsOf(received)).toHaveLength(2));
  });

  it('sin motivo se envía null', async () => {
    const received = server();
    mount();
    await openCancel();
    await userEvent.click(dlg().getByRole('button', { name: 'Cancelar cita' }));
    await screen.findByText('Se canceló la cita de Ana Pérez.');
    expect(patchesOf(received)[0].body).toEqual({ status: 'cancelled', cancellation_reason: null });
  });

  it('el error del servidor se muestra y la ventana sigue abierta con lo escrito', async () => {
    server((request) => (request.method === 'patch' ? { status: 409, data: { message: 'La cita ya fue cerrada.' } } : undefined));
    mount();
    await openCancel();
    await userEvent.type(dlg().getByRole('textbox', { name: /Motivo/ }), 'Aviso');
    await userEvent.click(dlg().getByRole('button', { name: 'Cancelar cita' }));
    expect(await dlg().findByText('La cita ya fue cerrada.')).toBeInTheDocument();
    expect(dlg().getByRole('textbox', { name: /Motivo/ })).toHaveValue('Aviso');
    expect(dlg().getByRole('button', { name: 'Cancelar cita' })).toBeEnabled();
  });

  it('un clic fuera de la ventana NO la cierra (no se pierde el motivo)', async () => {
    server();
    mount();
    await openCancel();
    await userEvent.type(dlg().getByRole('textbox', { name: /Motivo/ }), 'Aviso');
    fireEvent.click(screen.getByTestId('fondo-dialogo'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(dlg().getByRole('textbox', { name: /Motivo/ })).toHaveValue('Aviso');
  });

  it('"Volver" cierra sin llamar al servidor', async () => {
    const received = server();
    mount();
    await openCancel();
    await userEvent.click(dlg().getByRole('button', { name: 'Volver' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(patchesOf(received)).toHaveLength(0);
  });
});

describe('useCitas', () => {
  it('al cambiar de sucursal vuelve a pedir la agenda', async () => {
    const received = server();
    const filters = { date: TODAY, branchId: CENTRAL.id, status: '' as const };
    const { rerender } = renderHook(({ value }) => useCitas(value, 1), { initialProps: { value: filters } });
    await waitFor(() => expect(getsOf(received)).toHaveLength(1));
    rerender({ value: { ...filters, branchId: ESCALON.id } });
    await waitFor(() => expect(getsOf(received)).toHaveLength(2));
    expect(getsOf(received)[1].params).toMatchObject({ branch_id: ESCALON.id });
  });
});
