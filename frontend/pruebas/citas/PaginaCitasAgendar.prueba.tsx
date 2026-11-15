// =============================================================================
// PaginaCitasAgendar.prueba.tsx
// Qué prueba:   agendar y reprogramar citas desde la pantalla de Citas, con una
//               API falsa: buscar al paciente, ver los horarios por médico,
//               elegir uno libre, validaciones, errores del servidor (hora
//               tomada), y qué se envía al guardar.
// Cómo:         cliente real + ayudas/apiFalsa.ts; sesión de ayudas/conSesion.tsx.
// =============================================================================
import { fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useDisponibilidad } from '../../src/ganchos/useDisponibilidad';
import { PaginaCitas } from '../../src/paginas/citas/PaginaCitas';
import type { Appointment } from '../../src/servicios/citas';
import type { DayAvailability } from '../../src/servicios/disponibilidad';
import type { Patient } from '../../src/servicios/pacientes';
import { addDays, todayText } from '../../src/utilidades/fechaLocal';
import { installFakeApi, type RecordedRequest } from '../ayudas/apiFalsa';
import { renderConSesion } from '../ayudas/conSesion';
import { CENTRAL } from '../ayudas/datosSesion';

const TODAY = todayText();
const TOMORROW = addDays(TODAY, 1);
const MEJIA = 'Dr. Alejandro Mejía';
const RIVAS = 'Dra. Rivas';

const ANA: Patient = {
  id: 'p1', record_number: 101, full_name: 'Ana Pérez', birth_date: '1990-05-20', phone: '7000-1111',
  dui: null, email: null, is_active: true, created_at: '', updated_at: '',
};
const ANDREA: Patient = { ...ANA, id: 'p2', record_number: 102, full_name: 'Andrea Cruz', phone: '7222-3333' };

const SCHEDULED: Appointment = {
  id: 'c1', patient_id: 'p1', patient_name: 'Ana Pérez', patient_record_number: 101, patient_phone: '7000-1111',
  doctor_id: 'd1', doctor_name: MEJIA, branch_id: CENTRAL.id, branch_code: 'CENTRAL', branch_name: 'Candray Central',
  starts_at: `${TODAY} 08:30:00`, ends_at: `${TODAY} 09:00:00`, status: 'scheduled', reason: 'Control',
  cancellation_reason: null, created_by: 'u1', created_by_name: 'Marta', created_at: '', updated_at: '',
};
const DONE: Appointment = { ...SCHEDULED, id: 'c2', patient_name: 'Luis Gómez', status: 'completed' };

// Disponibilidad de prueba: el Dr. con una hora libre, una ocupada y una pasada; la Dra. con dos libres.
function availabilityOf(date: string): DayAvailability {
  return {
    date, branch_id: CENTRAL.id, weekday: 1,
    doctors: [
      {
        doctor_id: 'd1', doctor_name: MEJIA, blocks: [{ start_time: '08:00', end_time: '09:30' }], free_count: 1,
        slots: [{ time: '08:00', status: 'free' }, { time: '08:30', status: 'booked' }, { time: '09:00', status: 'past' }],
      },
      {
        doctor_id: 'd2', doctor_name: RIVAS, blocks: [{ start_time: '10:00', end_time: '11:00' }], free_count: 2,
        slots: [{ time: '10:00', status: 'free' }, { time: '10:30', status: 'free' }],
      },
    ],
  };
}

type Reply = { status: number; data?: unknown } | undefined;
function server(overrides: (request: RecordedRequest) => Reply | Promise<Reply> = () => undefined) {
  return installFakeApi(async (request) => {
    const custom = await overrides(request);
    if (custom !== undefined) return custom;
    const pagination = (total: number) => ({ page: 1, page_size: 25, total, total_pages: total === 0 ? 0 : 1 });
    if (request.method === 'get' && request.url === '/citas') {
      return { status: 200, data: { data: [SCHEDULED, DONE], pagination: pagination(2) } };
    }
    if (request.method === 'get' && request.url === '/disponibilidad') {
      return { status: 200, data: { data: availabilityOf(String(request.params?.date)) } };
    }
    if (request.method === 'get' && request.url === '/pacientes') {
      const q = String(request.params?.q ?? '').toLowerCase();
      const rows = [ANA, ANDREA].filter((patient) => patient.full_name.toLowerCase().includes(q));
      return { status: 200, data: { data: rows, pagination: pagination(rows.length) } };
    }
    if (request.method === 'post' && request.url === '/citas') {
      return { status: 201, data: { data: { ...SCHEDULED, id: 'nueva', starts_at: `${request.body && (request.body as { date: string }).date} 08:00:00`, doctor_name: MEJIA } } };
    }
    if (request.method === 'patch') {
      return { status: 200, data: { data: { ...SCHEDULED, starts_at: `${TODAY} 08:00:00`, reason: 'Control' } } };
    }
    return { status: 404 };
  });
}

const mount = () =>
  renderConSesion(<PaginaCitas />, {
    role: 'recepcionista',
    capabilities: ['appointments_read', 'appointments_manage', 'availability_read', 'patients_search'],
    activeBranch: CENTRAL,
  });
const dlg = () => within(screen.getByRole('dialog'));
const slot = (time: string, doctor: string, state: 'Libre' | 'Ocupada' | 'Ya pasó' = 'Libre') =>
  dlg().getByRole('button', { name: `${time} con ${doctor} — ${state}` });
const getsOf = (received: RecordedRequest[], url: string) => received.filter((r) => r.method === 'get' && r.url === url);
const posts = (received: RecordedRequest[]) => received.filter((r) => r.method === 'post');
const patches = (received: RecordedRequest[]) => received.filter((r) => r.method === 'patch');

async function openNew() {
  await screen.findByText('Luis Gómez');
  await userEvent.click(screen.getByRole('button', { name: /Nueva cita/ }));
}
async function pickPatient(search = 'an', name = 'Ana Pérez') {
  await userEvent.type(dlg().getByRole('searchbox', { name: /Buscar paciente/ }), search);
  await userEvent.click(await dlg().findByRole('button', { name: new RegExp(name) }));
}

describe('Nueva cita — paciente', () => {
  it('"Nueva cita" solo la ve quien puede agendar', async () => {
    server();
    renderConSesion(<PaginaCitas />, { role: 'doctor', capabilities: ['appointments_read'] });
    await screen.findByText('Luis Gómez');
    expect(screen.queryByRole('button', { name: /Nueva cita/ })).not.toBeInTheDocument();
  });

  it('si la agenda muestra otro día, la ventana empieza en ese día', async () => {
    const received = server();
    mount();
    await screen.findByText('Luis Gómez');
    await userEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
    await userEvent.click(screen.getByRole('button', { name: /Nueva cita/ }));
    await dlg().findByText(MEJIA);
    expect(dlg().getByLabelText(/Día/)).toHaveValue(TOMORROW);
    expect(getsOf(received, '/disponibilidad')[0].params).toMatchObject({ date: TOMORROW });
  });

  it('abre pidiendo el paciente y los horarios de la fecha de la agenda en la sucursal activa', async () => {
    const received = server();
    mount();
    await openNew();
    expect(dlg().getByText('Nueva cita')).toBeInTheDocument();
    expect(dlg().getByRole('searchbox', { name: /Buscar paciente/ })).toBeInTheDocument();
    await dlg().findByText(MEJIA);
    expect(getsOf(received, '/disponibilidad')[0].params).toEqual({ date: TODAY, branch_id: CENTRAL.id });
  });

  it('con menos de 2 letras no busca', async () => {
    const received = server();
    mount();
    await openNew();
    await userEvent.type(dlg().getByRole('searchbox'), 'a');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(getsOf(received, '/pacientes')).toHaveLength(0);
    expect(dlg().queryByText('Buscando...')).not.toBeInTheDocument();
    expect(dlg().queryByText(/No hay pacientes activos/)).not.toBeInTheDocument();
  });

  it('espera a que la persona haga una pausa: una sola búsqueda, no una por letra', async () => {
    const received = server();
    mount();
    await openNew();
    await userEvent.type(dlg().getByRole('searchbox'), 'andr');
    await dlg().findByRole('button', { name: /Andrea Cruz/ });
    expect(getsOf(received, '/pacientes')).toHaveLength(1);
    expect(getsOf(received, '/pacientes')[0].params).toMatchObject({ q: 'andr' });
  });

  it('busca activos (sin include_inactive), muestra los resultados y al elegir uno lo deja fijo', async () => {
    const received = server();
    mount();
    await openNew();
    await userEvent.type(dlg().getByRole('searchbox'), 'an');
    await dlg().findByRole('button', { name: /Ana Pérez/ });
    expect(dlg().getByRole('button', { name: /Andrea Cruz/ })).toBeInTheDocument();
    expect(getsOf(received, '/pacientes')[0].params).toEqual({ q: 'an', page: 1, page_size: 25 });
    await userEvent.click(dlg().getByRole('button', { name: /Ana Pérez/ }));
    expect(dlg().getByText('Ana Pérez')).toBeInTheDocument();
    expect(dlg().getByText(/Expediente 101/)).toBeInTheDocument();
    expect(dlg().queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('"Cambiar" vuelve a la búsqueda, conservando lo escrito para elegir a otro parecido', async () => {
    server();
    mount();
    await openNew();
    await pickPatient();
    await userEvent.click(dlg().getByRole('button', { name: 'Cambiar' }));
    expect(dlg().getByRole('searchbox')).toHaveValue('an');
    expect(await dlg().findByRole('button', { name: /Andrea Cruz/ })).toBeInTheDocument();
  });

  it('sin coincidencias lo dice y manda a registrar al paciente', async () => {
    server();
    mount();
    await openNew();
    await userEvent.type(dlg().getByRole('searchbox'), 'zzz');
    expect(await dlg().findByText(/No hay pacientes activos que coincidan/)).toBeInTheDocument();
  });

  it('si hay más resultados que los mostrados, pide afinar la búsqueda', async () => {
    server((request) =>
      request.url === '/pacientes'
        ? { status: 200, data: { data: [ANA], pagination: { page: 1, page_size: 25, total: 40, total_pages: 2 } } }
        : undefined,
    );
    mount();
    await openNew();
    await userEvent.type(dlg().getByRole('searchbox'), 'an');
    expect(await dlg().findByText(/Hay más resultados/)).toBeInTheDocument();
  });

  it('si la búsqueda falla muestra el mensaje', async () => {
    server((request) => (request.url === '/pacientes' ? { status: 500, data: { message: 'Falla de pacientes.' } } : undefined));
    mount();
    await openNew();
    await userEvent.type(dlg().getByRole('searchbox'), 'an');
    expect(await dlg().findByText('Falla de pacientes.')).toBeInTheDocument();
  });
});

describe('Nueva cita — horarios', () => {
  it('agrupa por médico, con cuántas libres tiene cada uno', async () => {
    server();
    mount();
    await openNew();
    await dlg().findByText(MEJIA);
    expect(dlg().getByRole('region', { name: `Horarios de ${MEJIA}` })).toHaveTextContent('1 libre');
    expect(dlg().getByRole('region', { name: `Horarios de ${MEJIA}` })).not.toHaveTextContent('1 libres');
    expect(dlg().getByRole('region', { name: `Horarios de ${RIVAS}` })).toHaveTextContent('2 libres');
  });

  it('las libres se pueden elegir; las ocupadas y las que ya pasaron están apagadas', async () => {
    server();
    mount();
    await openNew();
    await dlg().findByText(MEJIA);
    expect(slot('08:00', MEJIA)).toBeEnabled();
    expect(slot('08:30', MEJIA, 'Ocupada')).toBeDisabled();
    expect(slot('09:00', MEJIA, 'Ya pasó')).toBeDisabled();
    expect(slot('10:30', RIVAS)).toBeEnabled();
  });

  it('elegir una hora la marca, y elegir otra cambia la marca', async () => {
    server();
    mount();
    await openNew();
    await dlg().findByText(MEJIA);
    await userEvent.click(slot('08:00', MEJIA));
    expect(slot('08:00', MEJIA)).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(slot('10:00', RIVAS));
    expect(slot('08:00', MEJIA)).toHaveAttribute('aria-pressed', 'false');
    expect(slot('10:00', RIVAS)).toHaveAttribute('aria-pressed', 'true');
  });

  it('dos médicos con la misma hora: se marca solo la del médico elegido', async () => {
    server((request) => {
      if (request.url !== '/disponibilidad') return undefined;
      const day = availabilityOf(String(request.params?.date));
      day.doctors[0].slots = [{ time: '10:00', status: 'free' }];
      return { status: 200, data: { data: day } };
    });
    mount();
    await openNew();
    await dlg().findByText(MEJIA);
    await userEvent.click(slot('10:00', RIVAS));
    expect(slot('10:00', RIVAS)).toHaveAttribute('aria-pressed', 'true');
    expect(slot('10:00', MEJIA)).toHaveAttribute('aria-pressed', 'false');
  });

  it('un médico sin horarios libres lo dice', async () => {
    server((request) => {
      if (request.url !== '/disponibilidad') return undefined;
      const day = availabilityOf(String(request.params?.date));
      day.doctors[0] = { ...day.doctors[0], free_count: 0, slots: [{ time: '08:00', status: 'booked' }] };
      return { status: 200, data: { data: day } };
    });
    mount();
    await openNew();
    expect(await dlg().findByText(/sin horarios libres/)).toBeInTheDocument();
  });

  it('un día en que ningún médico atiende lo explica', async () => {
    server((request) =>
      request.url === '/disponibilidad'
        ? { status: 200, data: { data: { date: String(request.params?.date), branch_id: CENTRAL.id, weekday: 7, doctors: [] } } }
        : undefined,
    );
    mount();
    await openNew();
    expect(await dlg().findByText('Ningún médico atiende ese día en esta sucursal.')).toBeInTheDocument();
  });

  it('si no se pueden cargar los horarios lo dice y Reintentar vuelve a pedirlos', async () => {
    let fail = true;
    const received = server((request) =>
      request.url === '/disponibilidad' && fail ? { status: 500, data: { message: 'Falla de horarios.' } } : undefined,
    );
    mount();
    await openNew();
    expect(await dlg().findByText('Falla de horarios.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(dlg().getByRole('button', { name: 'Reintentar' }));
    await dlg().findByText(MEJIA);
    expect(getsOf(received, '/disponibilidad')).toHaveLength(2);
  });

  it('cambiar el día pide los horarios de ese día y quita el horario elegido', async () => {
    const received = server();
    mount();
    await openNew();
    await dlg().findByText(MEJIA);
    await userEvent.click(slot('08:00', MEJIA));
    fireEvent.change(dlg().getByLabelText(/Día/), { target: { value: TOMORROW } });
    await waitFor(() => expect(getsOf(received, '/disponibilidad').at(-1)?.params).toMatchObject({ date: TOMORROW }));
    await waitFor(() => expect(slot('08:00', MEJIA)).toHaveAttribute('aria-pressed', 'false'));
  });

  it('mientras llegan los horarios del día nuevo no se ven los del día anterior', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    server(async (request) => {
      if (request.url === '/disponibilidad' && request.params?.date === TOMORROW) await gate;
      return undefined;
    });
    mount();
    await openNew();
    await dlg().findByText(MEJIA);
    fireEvent.change(dlg().getByLabelText(/Día/), { target: { value: TOMORROW } });
    expect(await dlg().findByText('Cargando horarios...')).toBeInTheDocument();
    expect(dlg().queryByRole('button', { name: /con Dr\./ })).not.toBeInTheDocument();
    release();
    await dlg().findByText(MEJIA);
  });

  it('si se borra el campo del día se ignora y el día mínimo es hoy', async () => {
    const received = server();
    mount();
    await openNew();
    await dlg().findByText(MEJIA);
    const day = dlg().getByLabelText(/Día/);
    expect(day).toHaveAttribute('min', TODAY);
    fireEvent.change(day, { target: { value: '' } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(getsOf(received, '/disponibilidad')).toHaveLength(1);
    expect(day).toHaveValue(TODAY);
  });
});

describe('Nueva cita — guardar', () => {
  it('sin paciente lo pide y no llama al servidor', async () => {
    const received = server();
    mount();
    await openNew();
    await dlg().findByText(MEJIA);
    await userEvent.click(slot('08:00', MEJIA));
    await userEvent.click(dlg().getByRole('button', { name: 'Agendar cita' }));
    expect(await dlg().findByText('Elija el paciente de la cita.')).toBeInTheDocument();
    expect(posts(received)).toHaveLength(0);
  });

  it('sin horario lo pide y no llama al servidor', async () => {
    const received = server();
    mount();
    await openNew();
    await pickPatient();
    await dlg().findByText(MEJIA);
    await userEvent.click(dlg().getByRole('button', { name: 'Agendar cita' }));
    expect(await dlg().findByText('Elija un horario disponible.')).toBeInTheDocument();
    expect(posts(received)).toHaveLength(0);
  });

  it('agenda con los datos elegidos, avisa, cierra y vuelve a pedir la agenda', async () => {
    const received = server();
    mount();
    await openNew();
    await pickPatient();
    await dlg().findByText(MEJIA);
    await userEvent.click(slot('08:00', MEJIA));
    await userEvent.type(dlg().getByRole('textbox', { name: /Motivo/ }), '  Revisión anual ');
    await userEvent.click(dlg().getByRole('button', { name: 'Agendar cita' }));
    await screen.findByText(/Cita agendada para Ana Pérez/);
    expect(posts(received)[0]).toMatchObject({
      url: '/citas',
      body: { patient_id: 'p1', doctor_id: 'd1', branch_id: CENTRAL.id, date: TODAY, time: '08:00', reason: 'Revisión anual' },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(getsOf(received, '/citas')).toHaveLength(2));
  });

  it('sin motivo envía null', async () => {
    const received = server();
    mount();
    await openNew();
    await pickPatient();
    await dlg().findByText(MEJIA);
    await userEvent.click(slot('10:30', RIVAS));
    await userEvent.click(dlg().getByRole('button', { name: 'Agendar cita' }));
    await screen.findByText(/Cita agendada/);
    expect(posts(received)[0].body).toMatchObject({ doctor_id: 'd2', time: '10:30', reason: null });
  });

  it('si se agenda para otro día, la agenda salta a ese día con todos los estados', async () => {
    const received = server();
    mount();
    await screen.findByText('Luis Gómez');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'completed');
    await userEvent.click(screen.getByRole('button', { name: /Nueva cita/ }));
    await pickPatient();
    await dlg().findByText(MEJIA);
    fireEvent.change(dlg().getByLabelText(/Día/), { target: { value: TOMORROW } });
    await waitFor(() => expect(getsOf(received, '/disponibilidad').at(-1)?.params).toMatchObject({ date: TOMORROW }));
    await userEvent.click(await dlg().findByRole('button', { name: `08:00 con ${MEJIA} — Libre` }));
    await userEvent.click(dlg().getByRole('button', { name: 'Agendar cita' }));
    await screen.findByText(/Cita agendada para Ana Pérez/);
    await waitFor(() => {
      const last = getsOf(received, '/citas').at(-1)?.params;
      expect(last).toMatchObject({ date: TOMORROW });
      expect(last).not.toHaveProperty('status');
    });
    expect(screen.getByLabelText('Fecha')).toHaveValue(TOMORROW);
  });

  it('si el servidor dice que la hora ya fue tomada, lo muestra, vuelve a pedir los horarios y pide elegir otra', async () => {
    let taken = false;
    const received = server((request) => {
      if (request.method === 'post') {
        taken = true;
        return { status: 409, data: { message: 'El médico ya tiene una cita a esa hora.' } };
      }
      if (request.url === '/disponibilidad' && taken) {
        const day = availabilityOf(String(request.params?.date));
        day.doctors[0].slots[0] = { time: '08:00', status: 'booked' };
        return { status: 200, data: { data: day } };
      }
      return undefined;
    });
    mount();
    await openNew();
    await pickPatient();
    await dlg().findByText(MEJIA);
    await userEvent.click(slot('08:00', MEJIA));
    await userEvent.click(dlg().getByRole('button', { name: 'Agendar cita' }));
    expect(await dlg().findByText('El médico ya tiene una cita a esa hora.')).toBeInTheDocument();
    await waitFor(() => expect(getsOf(received, '/disponibilidad')).toHaveLength(2));
    await waitFor(() => expect(slot('08:00', MEJIA, 'Ocupada')).toBeDisabled());
    expect(slot('08:00', MEJIA, 'Ocupada')).toHaveAttribute('aria-pressed', 'false'); // ya no queda marcada
    expect(dlg().getByRole('button', { name: 'Agendar cita' })).toBeEnabled();
    await userEvent.click(dlg().getByRole('button', { name: 'Agendar cita' }));
    expect(await dlg().findByText('Elija un horario disponible.')).toBeInTheDocument();
    expect(posts(received)).toHaveLength(1);
  });

  it('un clic fuera de la ventana no la cierra', async () => {
    server();
    mount();
    await openNew();
    fireEvent.click(screen.getByTestId('fondo-dialogo'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Cancelar cierra sin llamar al servidor y quita un aviso anterior al abrir otra vez', async () => {
    const received = server();
    mount();
    await openNew();
    await userEvent.click(dlg().getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(posts(received)).toHaveLength(0);
  });
});

describe('Reprogramar', () => {
  async function openReschedule() {
    await screen.findByText('Luis Gómez');
    await userEvent.click(screen.getByRole('button', { name: 'Reprogramar la cita de Ana Pérez' }));
    await dlg().findByText(MEJIA);
  }

  it('el botón solo está en las citas programadas y solo para quien puede modificar', async () => {
    server();
    mount();
    await screen.findByText('Luis Gómez');
    expect(screen.getAllByRole('button', { name: /Reprogramar la cita/ })).toHaveLength(1);
    expect(within(screen.getByText('Luis Gómez').closest('tr')!).queryByRole('button')).not.toBeInTheDocument();
  });

  it('abre con la cita actual, sin buscar paciente, con el motivo escrito y sin horario elegido', async () => {
    server();
    mount();
    await openReschedule();
    expect(dlg().getByText('Reprogramar cita')).toBeInTheDocument();
    expect(dlg().getByText(/Cita de/)).toHaveTextContent(`Cita de Ana Pérez con ${MEJIA}`);
    expect(dlg().queryByRole('searchbox')).not.toBeInTheDocument();
    expect(dlg().getByLabelText(/Día/)).toHaveValue(TODAY);
    expect(dlg().getByRole('textbox', { name: /Motivo/ })).toHaveValue('Control');
    expect(slot('08:00', MEJIA)).toHaveAttribute('aria-pressed', 'false');
  });

  it('sin cambios lo dice y no llama al servidor', async () => {
    const received = server();
    mount();
    await openReschedule();
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar cambios' }));
    expect(await dlg().findByText('No hay cambios que guardar.')).toBeInTheDocument();
    expect(patches(received)).toHaveLength(0);
  });

  it('otra hora del mismo médico envía solo la hora, avisa y recarga', async () => {
    const received = server();
    mount();
    await openReschedule();
    await userEvent.click(slot('08:00', MEJIA));
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText(/Cita de Ana Pérez reprogramada/);
    expect(patches(received)[0]).toMatchObject({ url: '/citas/c1', body: { time: '08:00' } });
    expect(Object.keys(patches(received)[0].body as object)).toEqual(['time']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(getsOf(received, '/citas')).toHaveLength(2));
  });

  it('otro médico en la misma hora envía solo el médico', async () => {
    const received = server((request) => {
      if (request.url !== '/disponibilidad') return undefined;
      const day = availabilityOf(String(request.params?.date));
      day.doctors[1].slots = [{ time: '08:30', status: 'free' }];
      return { status: 200, data: { data: day } };
    });
    mount();
    await openReschedule();
    await userEvent.click(slot('08:30', RIVAS));
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText(/reprogramada/);
    expect(patches(received)[0].body).toEqual({ doctor_id: 'd2' });
  });

  it('otro día envía el día y la hora', async () => {
    const received = server();
    mount();
    await openReschedule();
    fireEvent.change(dlg().getByLabelText(/Día/), { target: { value: TOMORROW } });
    await userEvent.click(await dlg().findByRole('button', { name: `10:00 con ${RIVAS} — Libre` }));
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText(/reprogramada/);
    expect(patches(received)[0].body).toEqual({ doctor_id: 'd2', date: TOMORROW, time: '10:00' });
  });

  it('cambiar solo el motivo no pide horario; borrarlo envía null', async () => {
    const received = server();
    mount();
    await openReschedule();
    await userEvent.clear(dlg().getByRole('textbox', { name: /Motivo/ }));
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText(/reprogramada/);
    expect(patches(received)[0].body).toEqual({ reason: null });
  });

  it('el error del servidor se muestra y la ventana sigue abierta', async () => {
    server((request) => (request.method === 'patch' ? { status: 409, data: { message: 'El paciente ya tiene una cita a esa hora.' } } : undefined));
    mount();
    await openReschedule();
    await userEvent.click(slot('08:00', MEJIA));
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar cambios' }));
    expect(await dlg().findByText('El paciente ya tiene una cita a esa hora.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('si el horario elegido ya no está libre, no se envía y se pide elegir otro', async () => {
    let taken = false;
    const received = server((request) => {
      if (request.method === 'patch') {
        taken = true;
        return { status: 409, data: { message: 'El médico ya tiene una cita a esa hora.' } };
      }
      if (request.url === '/disponibilidad' && taken) {
        const day = availabilityOf(String(request.params?.date));
        day.doctors[0].slots[0] = { time: '08:00', status: 'booked' };
        return { status: 200, data: { data: day } };
      }
      return undefined;
    });
    mount();
    await openReschedule();
    await userEvent.click(slot('08:00', MEJIA));
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar cambios' }));
    await dlg().findByText('El médico ya tiene una cita a esa hora.');
    await waitFor(() => expect(slot('08:00', MEJIA, 'Ocupada')).toBeDisabled());
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar cambios' }));
    expect(await dlg().findByText('Ese horario ya no está disponible. Elija otro.')).toBeInTheDocument();
    expect(patches(received)).toHaveLength(1); // el segundo intento no salió: la hora ya no está libre
  });
});

describe('useDisponibilidad', () => {
  it('al cambiar de sucursal o de día vuelve a pedir los horarios', async () => {
    const received = server();
    const { rerender } = renderHook(({ day, branch }) => useDisponibilidad(day, branch), {
      initialProps: { day: TODAY, branch: CENTRAL.id },
    });
    await waitFor(() => expect(getsOf(received, '/disponibilidad')).toHaveLength(1));
    rerender({ day: TODAY, branch: 'otra-sucursal' });
    await waitFor(() => expect(getsOf(received, '/disponibilidad')).toHaveLength(2));
    expect(getsOf(received, '/disponibilidad')[1].params).toMatchObject({ branch_id: 'otra-sucursal' });
    rerender({ day: TOMORROW, branch: 'otra-sucursal' });
    await waitFor(() => expect(getsOf(received, '/disponibilidad')).toHaveLength(3));
  });
});
