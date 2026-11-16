// =============================================================================
// PaginaExpediente.prueba.tsx
// Qué prueba:   la pantalla del expediente de punta a punta con una API falsa:
//               historial (notas y enmiendas), avisos según el motivo de acceso,
//               quién ve los botones de escribir y enmendar, acceso denegado,
//               páginas, escribir una nota (consultas ofrecidas, validación,
//               errores del servidor) y enmendar (valores de partida, sin
//               cambios, envío).
// Cómo:         cliente real + ayudas/apiFalsa.ts; sesión de ayudas/conSesion.tsx.
// =============================================================================
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Capability } from '../../src/configuracion/capacidades';
import type { Role } from '../../src/configuracion/roles';
import { PaginaExpediente } from '../../src/paginas/expediente/PaginaExpediente';
import type { PendingConsultation, RecordAccess, RecordEntry } from '../../src/servicios/expedientes';
import type { Patient } from '../../src/servicios/pacientes';
import { installFakeApi, type RecordedRequest } from '../ayudas/apiFalsa';
import { renderConSesion } from '../ayudas/conSesion';

const PATIENT: Patient = {
  id: 'p1', record_number: 101, full_name: 'Ana Pérez', birth_date: '1990-05-20', phone: '7000-1111',
  dui: null, email: null, is_active: true, created_at: '', updated_at: '',
};

const NOTE: RecordEntry = {
  id: 'n1', patient_id: 'p1', doctor_id: 'd1', doctor_name: 'Dr. Mejía', branch_id: 'b1', branch_name: 'Candray Central',
  appointment_id: 'c1', appointment_starts_at: '2026-10-05 09:00:00', amends_id: null,
  diagnosis: 'Miopía leve', treatment: 'Lentes', notes: null, created_at: '2026-10-05 09:40:00', amendment_count: 1,
};
const AMENDMENT: RecordEntry = {
  ...NOTE, id: 'e1', doctor_name: 'Dra. Rivas', branch_name: 'Candray Escalón', appointment_id: null,
  appointment_starts_at: null, amends_id: 'n1', diagnosis: 'Miopía moderada', treatment: null, notes: 'Cambió la graduación',
  created_at: '2026-10-20 15:10:00', amendment_count: 0,
};
const OLD: RecordEntry = {
  ...NOTE, id: 'n0', appointment_id: 'c0', appointment_starts_at: '2026-03-02 08:30:00', diagnosis: 'Control normal',
  treatment: null, notes: null, created_at: '2026-03-02 09:00:00', amendment_count: 0,
};
const ENTRIES = [AMENDMENT, NOTE, OLD]; // la más reciente primero

const CONSULTATION_A: PendingConsultation = { id: 'c2', starts_at: '2026-11-10 10:00:00', branch_name: 'Candray Central', reason: 'Control' };
const CONSULTATION_B: PendingConsultation = { id: 'c3', starts_at: '2026-11-12 14:30:00', branch_name: 'Candray Escalón', reason: null };

const pagination = (page = 1, totalPages = 1, total = ENTRIES.length) => ({ page, page_size: 20, total, total_pages: totalPages });

type Reply = { status: number; data?: unknown } | undefined;
function server(options: {
  access?: RecordAccess;
  pending?: PendingConsultation[];
  override?: (request: RecordedRequest) => Reply;
} = {}) {
  const { access = { reason: 'appointment' }, pending = [CONSULTATION_A, CONSULTATION_B], override = () => undefined } = options;
  return installFakeApi((request) => {
    const custom = override(request);
    if (custom !== undefined) return custom;
    if (request.method === 'get' && request.url === '/pacientes/p1') return { status: 200, data: { data: PATIENT } };
    if (request.method === 'get' && request.url === '/pacientes/p1/expediente') {
      return { status: 200, data: { data: ENTRIES, access, pagination: pagination() } };
    }
    if (request.method === 'get' && request.url === '/pacientes/p1/expediente/pendientes') {
      return { status: 200, data: { data: pending } };
    }
    if (request.method === 'post') return { status: 201, data: { data: NOTE } };
    return { status: 404 };
  });
}

const DOCTOR_CAPS: Capability[] = ['patients_search', 'medical_records_read', 'medical_records_author'];

function mount(options: { role?: Role; capabilities?: Capability[] } = {}) {
  return renderConSesion(
    <Routes>
      <Route path="/pacientes/:patientId/expediente" element={<PaginaExpediente />} />
    </Routes>,
    { role: options.role ?? 'doctor', capabilities: options.capabilities ?? DOCTOR_CAPS, route: '/pacientes/p1/expediente' },
  );
}

const historyGets = (received: RecordedRequest[]) => received.filter((r) => r.method === 'get' && r.url === '/pacientes/p1/expediente');
const dlg = () => within(screen.getByRole('dialog'));
const entryOf = (text: string) => screen.getByText(text).closest('article')!;

describe('PaginaExpediente — el historial', () => {
  it('muestra el nombre del paciente, su número de expediente y su nacimiento', async () => {
    server();
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Pérez' })).toBeInTheDocument();
    expect(screen.getByText('Expediente N.º 101 · Nacimiento 20/05/1990')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver a pacientes/ })).toHaveAttribute('href', '/pacientes');
  });

  it('dibuja las entradas de la más reciente a la más antigua', async () => {
    server();
    mount();
    await screen.findByText('Miopía moderada');
    const entries = within(screen.getByRole('list', { name: 'Historial del expediente' })).getAllByRole('article');
    expect(entries.map((entry) => entry.querySelector('dd')?.textContent)).toEqual(['Miopía moderada', 'Miopía leve', 'Control normal']);
  });

  it('una nota muestra quién, cuándo, en qué sucursal y la fecha de la consulta', async () => {
    server();
    mount();
    await screen.findByText('Miopía leve');
    const note = within(entryOf('Miopía leve'));
    expect(note.getByText('Consulta')).toHaveClass('bg-info-fondo');
    expect(note.getByText('05/10/2026 09:40')).toBeInTheDocument();
    expect(note.getByText('Dr. Mejía · Candray Central')).toBeInTheDocument();
    expect(note.getByText('Consulta del 05/10/2026 09:00.')).toBeInTheDocument();
    expect(note.getByText('Lentes')).toBeInTheDocument();
    expect(note.getByText('Enmendada 1 vez')).toBeInTheDocument();
  });

  it('una enmienda dice qué nota corrige (por su fecha) y de qué sucursal viene', async () => {
    server();
    mount();
    await screen.findByText('Miopía moderada');
    const amendment = within(entryOf('Miopía moderada'));
    expect(amendment.getByText('Enmienda')).toHaveClass('bg-aviso-fondo'); // se distingue de una consulta
    expect(amendment.getByText('Dra. Rivas · Candray Escalón')).toBeInTheDocument();
    expect(amendment.getByText('Corrige la nota del 05/10/2026.')).toBeInTheDocument();
    expect(amendment.getByText('Cambió la graduación')).toBeInTheDocument();
  });

  it('si la nota corregida no está en la página, la enmienda lo dice sin inventar fecha', async () => {
    server({
      override: (request) =>
        request.url === '/pacientes/p1/expediente'
          ? { status: 200, data: { data: [AMENDMENT], access: { reason: 'appointment' }, pagination: pagination(1, 2, 2) } }
          : undefined,
    });
    mount();
    await screen.findByText('Miopía moderada');
    expect(screen.getByText('Corrige una nota anterior.')).toBeInTheDocument();
  });

  it('no dibuja los campos vacíos (tratamiento y notas)', async () => {
    server();
    mount();
    await screen.findByText('Control normal');
    const old = within(entryOf('Control normal'));
    expect(old.queryByText('Tratamiento')).not.toBeInTheDocument();
    expect(old.queryByText('Notas')).not.toBeInTheDocument();
    expect(old.queryByText(/Enmendada/)).not.toBeInTheDocument();
  });

  it('sin entradas avisa que el expediente está vacío', async () => {
    server({
      override: (request) =>
        request.url === '/pacientes/p1/expediente'
          ? { status: 200, data: { data: [], access: { reason: 'appointment' }, pagination: pagination(1, 0, 0) } }
          : undefined,
    });
    mount();
    expect(await screen.findByText('Este paciente todavía no tiene notas en su expediente.')).toBeInTheDocument();
  });

  it('carga el historial UNA sola vez (cada lectura queda en la bitácora)', async () => {
    const received = server();
    mount();
    await screen.findByText('Miopía leve');
    expect(historyGets(received)).toHaveLength(1);
  });

  it('con varias páginas navega y pide la página elegida', async () => {
    const received = server({
      override: (request) =>
        request.url === '/pacientes/p1/expediente' && request.method === 'get'
          ? { status: 200, data: { data: ENTRIES, access: { reason: 'appointment' }, pagination: pagination(Number(request.params?.page), 3, 50) } }
          : undefined,
    });
    mount();
    await screen.findByText('Miopía leve');
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toHaveTextContent('Página 1 de 3 · 50 entradas');
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(historyGets(received).at(-1)?.params).toMatchObject({ page: 2 }));
  });
});

describe('PaginaExpediente — por qué se ve y qué botones hay', () => {
  it('quien atiende al paciente ve "Nueva nota", "Enmendar" en cada entrada y ningún aviso de acceso', async () => {
    server();
    mount();
    await screen.findByText('Miopía leve');
    expect(screen.getByRole('button', { name: /Nueva nota/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Enmendar la nota/ })).toHaveLength(3);
    expect(screen.queryByText(/Acceso por interconsulta/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Vista de administración/)).not.toBeInTheDocument();
  });

  it('por interconsulta: avisa hasta cuándo, y es solo lectura aunque tenga la capacidad de escribir', async () => {
    server({ access: { reason: 'referral', expiresAt: '2026-12-01 10:00:00' } });
    mount();
    await screen.findByText('Miopía leve');
    expect(screen.getByText('Acceso por interconsulta, solo lectura, hasta el 01/12/2026 10:00.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nueva nota/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enmendar/ })).not.toBeInTheDocument();
  });

  it('administración: avisa que es solo lectura y no ofrece escribir', async () => {
    server({ access: { reason: 'role' } });
    mount({ role: 'admin', capabilities: [...DOCTOR_CAPS] });
    await screen.findByText('Miopía leve');
    expect(screen.getByText(/Vista de administración, solo lectura/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nueva nota/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enmendar/ })).not.toBeInTheDocument();
  });

  it('sin la capacidad de escribir no hay botones, aunque atienda al paciente', async () => {
    server();
    mount({ capabilities: ['patients_search', 'medical_records_read'] });
    await screen.findByText('Miopía leve');
    expect(screen.queryByRole('button', { name: /Nueva nota/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enmendar/ })).not.toBeInTheDocument();
  });
});

describe('PaginaExpediente — acceso denegado y errores', () => {
  const denied = (request: RecordedRequest): Reply =>
    request.url === '/pacientes/p1/expediente'
      ? { status: 403, data: { success: false, message: 'No tiene acceso al expediente de este paciente.' } }
      : undefined;

  it('muestra el mensaje del servidor, nada del historial y ningún botón de escribir', async () => {
    server({ override: denied });
    mount();
    expect(await screen.findByText('No tiene acceso al expediente de este paciente.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Historial del expediente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nueva nota/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver a pacientes/ })).toBeInTheDocument();
  });

  it('un fallo al cargar se puede reintentar', async () => {
    let fail = true;
    const received = server({
      override: (request) => {
        if (request.url === '/pacientes/p1/expediente' && fail) return { status: 500 };
        return undefined;
      },
    });
    mount();
    await screen.findByText('No se pudo cargar el expediente.');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Miopía leve');
    expect(historyGets(received)).toHaveLength(2);
  });
});

describe('PaginaExpediente — escribir una nota', () => {
  async function openForm() {
    await screen.findByText('Miopía leve');
    await userEvent.click(screen.getByRole('button', { name: /Nueva nota/ }));
    await dlg().findByRole('combobox', { name: /Consulta/ });
  }

  it('ofrece las consultas pendientes con fecha, sucursal y motivo', async () => {
    server();
    mount();
    await openForm();
    const options = dlg().getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual([
      'Elija la consulta',
      '10/11/2026 10:00 · Candray Central · Control',
      '12/11/2026 14:30 · Candray Escalón',
    ]);
  });

  it('con una sola consulta posible ya viene elegida', async () => {
    server({ pending: [CONSULTATION_A] });
    mount();
    await openForm();
    expect(dlg().getByRole('combobox', { name: /Consulta/ })).toHaveValue('c2');
  });

  it('sin consultas pendientes lo explica y no deja guardar', async () => {
    server({ pending: [] });
    mount();
    await screen.findByText('Miopía leve');
    await userEvent.click(screen.getByRole('button', { name: /Nueva nota/ }));
    expect(await dlg().findByText(/No tiene consultas pendientes de nota/)).toBeInTheDocument();
    expect(dlg().getByRole('button', { name: 'Guardar nota' })).toBeDisabled();
  });

  it('no envía nada sin elegir la consulta ni sin diagnóstico', async () => {
    const received = server();
    mount();
    await openForm();
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar nota' }));
    expect(await dlg().findByText('Elija la consulta a la que pertenece la nota.')).toBeInTheDocument();
    await userEvent.selectOptions(dlg().getByRole('combobox', { name: /Consulta/ }), 'c2');
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar nota' }));
    expect(await dlg().findByText('El diagnóstico es obligatorio.')).toBeInTheDocument();
    expect(received.filter((r) => r.method === 'post')).toHaveLength(0);
  });

  it('guarda la nota con null en lo opcional vacío, avisa, cierra y recarga el historial', async () => {
    const received = server();
    mount();
    await openForm();
    await userEvent.selectOptions(dlg().getByRole('combobox', { name: /Consulta/ }), 'c2');
    await userEvent.type(dlg().getByRole('textbox', { name: /Diagnóstico/ }), '  Astigmatismo  ');
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar nota' }));
    await screen.findByText('Nota guardada en el expediente.');
    expect(received.filter((r) => r.method === 'post')[0]).toMatchObject({
      url: '/pacientes/p1/expediente',
      body: { appointment_id: 'c2', diagnosis: 'Astigmatismo', treatment: null, notes: null },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(historyGets(received)).toHaveLength(2);
  });

  it.each([
    ['"Nueva nota"', () => screen.getByRole('button', { name: /Nueva nota/ })],
    ['"Enmendar"', () => within(entryOf('Miopía leve')).getByRole('button', { name: /^Enmendar la nota/ })],
  ])('al abrir %s, el aviso del guardado anterior desaparece', async (_name, openButton) => {
    server();
    mount();
    await openForm();
    await userEvent.selectOptions(dlg().getByRole('combobox', { name: /Consulta/ }), 'c2');
    await userEvent.type(dlg().getByRole('textbox', { name: /Diagnóstico/ }), 'Astigmatismo');
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar nota' }));
    await screen.findByText('Nota guardada en el expediente.');
    await userEvent.click(openButton());
    await screen.findByRole('dialog');
    expect(screen.queryByText('Nota guardada en el expediente.')).not.toBeInTheDocument();
  });

  it('envía tratamiento y notas cuando se llenan', async () => {
    const received = server();
    mount();
    await openForm();
    await userEvent.selectOptions(dlg().getByRole('combobox', { name: /Consulta/ }), 'c3');
    await userEvent.type(dlg().getByRole('textbox', { name: /Diagnóstico/ }), 'Miopía');
    await userEvent.type(dlg().getByRole('textbox', { name: /Tratamiento/ }), 'Lentes');
    await userEvent.type(dlg().getByRole('textbox', { name: /Notas/ }), 'Control en 6 meses');
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar nota' }));
    await screen.findByText('Nota guardada en el expediente.');
    expect(received.filter((r) => r.method === 'post')[0].body).toEqual({
      appointment_id: 'c3', diagnosis: 'Miopía', treatment: 'Lentes', notes: 'Control en 6 meses',
    });
  });

  it('si el servidor la rechaza, muestra su mensaje y la ventana sigue abierta con lo escrito', async () => {
    server({
      override: (request) =>
        request.method === 'post'
          ? { status: 409, data: { success: false, message: 'Esa consulta ya tiene su nota. Para corregirla, agregue una enmienda.' } }
          : undefined,
    });
    mount();
    await openForm();
    await userEvent.selectOptions(dlg().getByRole('combobox', { name: /Consulta/ }), 'c2');
    await userEvent.type(dlg().getByRole('textbox', { name: /Diagnóstico/ }), 'Astigmatismo');
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar nota' }));
    expect(await dlg().findByText(/Esa consulta ya tiene su nota/)).toBeInTheDocument();
    expect(dlg().getByRole('textbox', { name: /Diagnóstico/ })).toHaveValue('Astigmatismo');
    expect(dlg().getByRole('button', { name: 'Guardar nota' })).toBeEnabled();
  });

  it('advierte que la nota no se podrá editar ni borrar', async () => {
    server();
    mount();
    await openForm();
    expect(dlg().getByText(/no se puede editar ni borrar/)).toBeInTheDocument();
  });

  it('Cancelar cierra la ventana sin enviar nada', async () => {
    const received = server();
    mount();
    await openForm();
    await userEvent.click(dlg().getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(received.filter((r) => r.method === 'post')).toHaveLength(0);
  });

  it('después de guardar estando en la página 2 vuelve a la 1 (donde está lo nuevo)', async () => {
    const received = server({
      override: (request) =>
        request.url === '/pacientes/p1/expediente' && request.method === 'get'
          ? { status: 200, data: { data: ENTRIES, access: { reason: 'appointment' }, pagination: pagination(Number(request.params?.page), 3, 50) } }
          : undefined,
    });
    mount();
    await screen.findByText('Miopía leve');
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(historyGets(received).at(-1)?.params).toMatchObject({ page: 2 }));
    await userEvent.click(screen.getByRole('button', { name: /Nueva nota/ }));
    await dlg().findByRole('combobox', { name: /Consulta/ });
    await userEvent.selectOptions(dlg().getByRole('combobox', { name: /Consulta/ }), 'c2');
    await userEvent.type(dlg().getByRole('textbox', { name: /Diagnóstico/ }), 'Astigmatismo');
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar nota' }));
    await screen.findByText('Nota guardada en el expediente.');
    await waitFor(() => expect(historyGets(received).at(-1)?.params).toMatchObject({ page: 1 }));
    expect(historyGets(received)).toHaveLength(3); // 1.ª carga, página 2, y vuelta a la 1 (una sola lectura por cambio)
  });
});

describe('PaginaExpediente — enmendar una nota', () => {
  async function openAmend(noteText: string) {
    await screen.findByText(noteText);
    await userEvent.click(within(entryOf(noteText)).getByRole('button', { name: /^Enmendar la nota/ }));
    await screen.findByRole('dialog');
  }

  it('abre con el contenido de la nota para corregirlo y aclara que la original no cambia', async () => {
    server();
    mount();
    await openAmend('Miopía leve');
    expect(dlg().getByRole('textbox', { name: /Diagnóstico/ })).toHaveValue('Miopía leve');
    expect(dlg().getByRole('textbox', { name: /Tratamiento/ })).toHaveValue('Lentes');
    expect(dlg().getByRole('textbox', { name: /Notas/ })).toHaveValue('');
    expect(dlg().getByText(/La nota original no se modifica/)).toBeInTheDocument();
  });

  it('sin cambios no envía nada', async () => {
    const received = server();
    mount();
    await openAmend('Miopía leve');
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar enmienda' }));
    expect(await dlg().findByText('No hay cambios que registrar: modifique al menos un campo.')).toBeInTheDocument();
    expect(received.filter((r) => r.method === 'post')).toHaveLength(0);
  });

  it('exige diagnóstico', async () => {
    const received = server();
    mount();
    await openAmend('Miopía leve');
    await userEvent.clear(dlg().getByRole('textbox', { name: /Diagnóstico/ }));
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar enmienda' }));
    expect(await dlg().findByText('El diagnóstico es obligatorio.')).toBeInTheDocument();
    expect(received.filter((r) => r.method === 'post')).toHaveLength(0);
  });

  it.each([
    ['solo el tratamiento', /Tratamiento/, 'Lentes y gotas', { diagnosis: 'Miopía leve', treatment: 'Lentes y gotas', notes: null }],
    ['solo las notas', /Notas/, 'Volver en un mes', { diagnosis: 'Miopía leve', treatment: 'Lentes', notes: 'Volver en un mes' }],
  ])('si cambia %s, es un cambio válido y se envía', async (_name, field, text, expectedBody) => {
    const received = server();
    mount();
    await openAmend('Miopía leve');
    fireEvent.change(dlg().getByRole('textbox', { name: field }), { target: { value: text } });
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar enmienda' }));
    await screen.findByText('Enmienda guardada en el expediente.');
    expect(received.filter((r) => r.method === 'post')[0].body).toEqual(expectedBody);
  });

  it('envía la enmienda a la ruta de ESA nota, avisa, cierra y recarga', async () => {
    const received = server();
    mount();
    await openAmend('Miopía leve');
    fireEvent.change(dlg().getByRole('textbox', { name: /Diagnóstico/ }), { target: { value: 'Miopía moderada' } });
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar enmienda' }));
    await screen.findByText('Enmienda guardada en el expediente.');
    expect(received.filter((r) => r.method === 'post')[0]).toMatchObject({
      url: '/pacientes/p1/expediente/n1/enmiendas',
      body: { diagnosis: 'Miopía moderada', treatment: 'Lentes', notes: null },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(historyGets(received)).toHaveLength(2);
  });

  it('si el servidor la rechaza, muestra su mensaje y sigue abierta', async () => {
    server({
      override: (request) =>
        request.method === 'post'
          ? { status: 403, data: { success: false, message: 'Solo un médico que haya atendido al paciente puede enmendar su expediente.' } }
          : undefined,
    });
    mount();
    await openAmend('Miopía leve');
    fireEvent.change(dlg().getByRole('textbox', { name: /Diagnóstico/ }), { target: { value: 'Otro' } });
    await userEvent.click(dlg().getByRole('button', { name: 'Guardar enmienda' }));
    expect(await dlg().findByText(/Solo un médico que haya atendido/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
