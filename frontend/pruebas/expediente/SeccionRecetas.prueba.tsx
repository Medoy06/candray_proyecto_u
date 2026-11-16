// =============================================================================
// SeccionRecetas.prueba.tsx
// Qué prueba:   las recetas dentro del expediente: la tarjeta (lista, estados,
//               medidas, quién ve qué botones), emitir una receta desde la nota
//               de la consulta, reemplazarla, y imprimir la vigente.
// Cómo:         la página completa con cliente real + ayudas/apiFalsa.ts; sesión
//               de ayudas/conSesion.tsx (el usuario de la sesión tiene id "u1").
// =============================================================================
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Capability } from '../../src/configuracion/capacidades';
import type { Role } from '../../src/configuracion/roles';
import { PaginaExpediente } from '../../src/paginas/expediente/PaginaExpediente';
import { SeccionRecetas } from '../../src/paginas/expediente/SeccionRecetas';
import type { RecordAccess, RecordEntry } from '../../src/servicios/expedientes';
import type { Patient } from '../../src/servicios/pacientes';
import type { Prescription } from '../../src/servicios/recetas';
import { installFakeApi, type RecordedRequest } from '../ayudas/apiFalsa';
import { renderConSesion } from '../ayudas/conSesion';

const PATIENT: Patient = {
  id: 'p1', record_number: 101, full_name: 'Ana Pérez', birth_date: '1990-05-20', phone: '7000-1111',
  dui: null, email: null, is_active: true, created_at: '', updated_at: '',
};

// Notas: la sesión es el usuario "u1".
const MINE: RecordEntry = {
  id: 'n1', patient_id: 'p1', doctor_id: 'u1', doctor_name: 'Alejandro Mejía', branch_id: 'b1', branch_name: 'Candray Central',
  appointment_id: 'c1', appointment_starts_at: '2026-10-05 09:00:00', amends_id: null,
  diagnosis: 'Miopía leve', treatment: null, notes: null, created_at: '2026-10-05 09:40:00', amendment_count: 0,
};
const MINE_PRESCRIBED: RecordEntry = {
  ...MINE, id: 'n2', appointment_id: 'c2', appointment_starts_at: '2026-09-01 09:00:00', diagnosis: 'Astigmatismo', created_at: '2026-09-01 09:30:00',
};
const OTHERS: RecordEntry = {
  ...MINE, id: 'n3', doctor_id: 'u9', doctor_name: 'Dra. Rivas', appointment_id: 'c3', diagnosis: 'Control de otra doctora', created_at: '2026-08-01 09:30:00',
};
const AMENDMENT: RecordEntry = {
  ...MINE, id: 'e1', appointment_id: null, appointment_starts_at: null, amends_id: 'n1', diagnosis: 'Miopía moderada', created_at: '2026-10-20 15:10:00',
};
const ENTRIES = [AMENDMENT, MINE, MINE_PRESCRIBED, OTHERS];

const BLANK = {
  od_sphere: null, od_cylinder: null, od_axis: null, od_addition: null,
  oi_sphere: null, oi_cylinder: null, oi_axis: null, oi_addition: null,
  pupillary_distance: null, lens_notes: null,
};
const CURRENT: Prescription = {
  ...BLANK, id: 'r2', patient_id: 'p1', doctor_id: 'u1', doctor_name: 'Alejandro Mejía', branch_id: 'b1', branch_name: 'Candray Central',
  record_id: 'n2', supersedes_id: 'r1', created_at: '2026-09-10 10:00:00', is_current: true,
  od_sphere: -2.25, od_cylinder: -0.75, od_axis: 90, od_addition: 1.5, oi_sphere: 0, pupillary_distance: 62.5, lens_notes: 'Antirreflejo',
};
const REPLACED: Prescription = {
  ...BLANK, id: 'r1', patient_id: 'p1', doctor_id: 'u1', doctor_name: 'Alejandro Mejía', branch_id: 'b1', branch_name: 'Candray Central',
  record_id: 'n2', supersedes_id: null, created_at: '2026-09-02 10:00:00', is_current: false, od_sphere: -2, oi_sphere: -1.75,
};

type Reply = { status: number; data?: unknown } | undefined;
function server(options: {
  access?: RecordAccess;
  prescriptions?: Prescription[];
  prescriptionAccess?: string;
  override?: (request: RecordedRequest) => Reply | Promise<Reply>;
} = {}) {
  const { access = { reason: 'appointment' }, prescriptions = [CURRENT, REPLACED], prescriptionAccess = 'appointment', override = () => undefined } = options;
  return installFakeApi(async (request) => {
    const custom = await override(request);
    if (custom !== undefined) return custom;
    if (request.method === 'get' && request.url === '/pacientes/p1') return { status: 200, data: { data: PATIENT } };
    if (request.method === 'get' && request.url === '/pacientes/p1/expediente') {
      return { status: 200, data: { data: ENTRIES, access, pagination: { page: 1, page_size: 20, total: ENTRIES.length, total_pages: 1 } } };
    }
    if (request.method === 'get' && request.url === '/pacientes/p1/recetas') {
      return { status: 200, data: { data: prescriptions, access: prescriptionAccess } };
    }
    if (request.method === 'post' && request.url === '/pacientes/p1/recetas') return { status: 201, data: { data: CURRENT } };
    if (request.method === 'post' && request.url.endsWith('/reemplazos')) return { status: 201, data: { data: CURRENT } };
    return { status: 404 };
  });
}

const BASE_CAPS: Capability[] = ['patients_search', 'medical_records_read', 'medical_records_author'];
const READ_CAPS: Capability[] = [...BASE_CAPS, 'prescriptions_read'];
const AUTHOR_CAPS: Capability[] = [...READ_CAPS, 'prescriptions_author'];

function mount(options: { role?: Role; capabilities?: Capability[] } = {}) {
  return renderConSesion(
    <Routes>
      <Route path="/pacientes/:patientId/expediente" element={<PaginaExpediente />} />
    </Routes>,
    { role: options.role ?? 'doctor', capabilities: options.capabilities ?? AUTHOR_CAPS, route: '/pacientes/p1/expediente' },
  );
}

const rxGets = (received: RecordedRequest[]) => received.filter((r) => r.method === 'get' && r.url === '/pacientes/p1/recetas');
const dlg = () => within(screen.getByRole('dialog'));
const card = () => within(screen.getByRole('heading', { name: 'Recetas' }).closest('section')!);
const entryOf = (text: string) => within(screen.getByText(text).closest('article')!);
// Espera a que aparezca algo dentro de la tarjeta (que existe solo cuando el expediente ya cargó).
const ready = (text: string | RegExp) => waitFor(() => expect(card().getByText(text)).toBeInTheDocument());
const eyeBox = (name: RegExp) => within(dlg().getByRole('group', { name }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('la tarjeta "Recetas"', () => {
  it('muestra cada receta con su estado, fecha, médico y sucursal', async () => {
    server();
    mount();
    await ready('Reemplazada');
    expect(card().getAllByRole('listitem')).toHaveLength(2);
    const current = within(card().getAllByRole('listitem')[0]);
    expect(current.getByText('Vigente')).toHaveClass('bg-exito-fondo');
    expect(current.getByText('10/09/2026 10:00')).toBeInTheDocument();
    expect(current.getByText('Alejandro Mejía · Candray Central')).toBeInTheDocument();
    expect(within(card().getAllByRole('listitem')[1]).getByText('Reemplazada')).toHaveClass('bg-neutro-fondo');
  });

  it('dibuja las medidas con signo, eje en grados, distancia pupilar y nota para el taller', async () => {
    server();
    mount();
    await ready('Vigente');
    const current = within(card().getAllByRole('listitem')[0]);
    const odRow = current.getByRole('row', { name: /Derecho/ });
    expect(within(odRow).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['-2.25', '-0.75', '90°', '+1.50']);
    const oiRow = current.getByRole('row', { name: /Izquierdo/ });
    expect(within(oiRow).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['0.00', '—', '—', '—']);
    expect(current.getByText('62.5 mm')).toBeInTheDocument();
    expect(current.getByText(/Antirreflejo/)).toBeInTheDocument();
  });

  it('los dos ojos medidos tienen su fila; sin distancia ni nota no se dibujan', async () => {
    server();
    mount();
    await ready('Reemplazada');
    const replaced = within(card().getAllByRole('listitem')[1]);
    expect(replaced.getByRole('row', { name: /Derecho/ })).toBeInTheDocument();
    expect(replaced.getAllByRole('row')).toHaveLength(3); // encabezado + los dos ojos
    expect(replaced.queryByText(/Distancia pupilar/)).not.toBeInTheDocument();
    expect(replaced.queryByText(/Para el taller/)).not.toBeInTheDocument();
  });

  it('un ojo sin esfera no tiene fila', async () => {
    server({ prescriptions: [{ ...REPLACED, oi_sphere: null }] });
    mount();
    await ready('Reemplazada');
    expect(card().queryByRole('row', { name: /Izquierdo/ })).not.toBeInTheDocument();
    expect(card().queryByText(/Distancia pupilar/)).not.toBeInTheDocument();
    expect(card().queryByText(/Para el taller/)).not.toBeInTheDocument();
  });

  it('la que reemplaza a otra lo dice con la fecha de la anterior', async () => {
    server();
    mount();
    await ready('Vigente');
    expect(within(card().getAllByRole('listitem')[0]).getByText('Reemplaza la receta del 02/09/2026.')).toBeInTheDocument();
    expect(within(card().getAllByRole('listitem')[1]).queryByText(/^Reemplaza (la|una) receta/)).not.toBeInTheDocument();
  });

  it('si la anterior no viene en la lista, lo dice sin inventar fecha', async () => {
    server({ prescriptions: [CURRENT] });
    mount();
    await ready('Vigente');
    expect(card().getByText('Reemplaza una receta anterior.')).toBeInTheDocument();
  });

  it('sin recetas lo dice, y a quien puede emitir le explica dónde', async () => {
    server({ prescriptions: [] });
    mount();
    await ready(/Este paciente todavía no tiene recetas\./);
    expect(card().getByText(/Este paciente todavía no tiene recetas\./)).toHaveTextContent('La receta se emite desde la nota de la consulta');
  });

  it('sin permiso de emitir, el aviso de "sin recetas" no habla de emitir', async () => {
    server({ prescriptions: [] });
    mount({ capabilities: READ_CAPS });
    await ready(/Este paciente todavía no tiene recetas\./);
    expect(card().getByText(/Este paciente todavía no tiene recetas\./)).not.toHaveTextContent('emite');
  });

  it('mientras carga lo dice', async () => {
    installFakeApi(async (request) => {
      if (request.url === '/pacientes/p1') return { status: 200, data: { data: PATIENT } };
      if (request.url === '/pacientes/p1/expediente') return { status: 200, data: { data: ENTRIES, access: { reason: 'appointment' }, pagination: { page: 1, page_size: 20, total: 4, total_pages: 1 } } };
      await new Promise(() => undefined); // las recetas nunca llegan
      return { status: 200 };
    });
    mount();
    await ready('Cargando recetas...');
    expect(card().queryByText(/todavía no tiene recetas/)).not.toBeInTheDocument();
  });

  it('al recargar conserva la lista a la vista y no vuelve a decir "Cargando"', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let reads = 0;
    server({
      override: async (r) => {
        if (r.method === 'get' && r.url === '/pacientes/p1/recetas' && ++reads === 2) await gate;
        return undefined;
      },
    });
    mount();
    await ready('Vigente');
    await userEvent.click(screen.getByRole('button', { name: /^Emitir la receta/ }));
    await dlg().findByRole('group', { name: /Ojo derecho/ });
    await userEvent.type(eyeBox(/Ojo derecho/).getByLabelText('Esfera'), '-1');
    await userEvent.click(dlg().getByRole('button', { name: 'Emitir receta' }));
    await screen.findByText('Receta emitida.');
    expect(card().getByText('Vigente')).toBeInTheDocument();
    expect(card().queryByText('Cargando recetas...')).not.toBeInTheDocument();
    release();
  });

  it('un fallo al cargar se puede reintentar', async () => {
    let fail = true;
    const received = server({ override: (r) => (r.url === '/pacientes/p1/recetas' && r.method === 'get' && fail ? { status: 500 } : undefined) });
    mount();
    await ready('No se pudieron cargar las recetas.');
    fail = false;
    await userEvent.click(card().getByRole('button', { name: 'Reintentar' }));
    await ready('Vigente');
    expect(rxGets(received)).toHaveLength(2);
    expect(card().queryByText('No se pudieron cargar las recetas.')).not.toBeInTheDocument();
  });

  it('el servidor puede negar la lectura y se muestra su mensaje; el expediente sigue a la vista', async () => {
    server({ override: (r) => (r.url === '/pacientes/p1/recetas' ? { status: 403, data: { success: false, message: 'Mensaje del servidor.' } } : undefined) });
    mount();
    await ready('Mensaje del servidor.');
    expect(card().queryByText(/todavía no tiene recetas/)).not.toBeInTheDocument();
    expect(screen.getByText('Miopía leve')).toBeInTheDocument();
  });

  it('sin la capacidad de leer recetas no hay tarjeta y NO se pide nada', async () => {
    const received = server();
    mount({ capabilities: BASE_CAPS });
    await screen.findByText('Miopía leve');
    expect(screen.queryByRole('heading', { name: 'Recetas' })).not.toBeInTheDocument();
    expect(rxGets(received)).toHaveLength(0);
  });

  it('la tarjeta va después de las interconsultas y antes del historial', async () => {
    server({ override: (r) => (r.url === '/pacientes/p1/interconsultas' ? { status: 200, data: { data: [] } } : undefined) });
    mount({ capabilities: [...AUTHOR_CAPS, 'referrals_manage'] });
    await ready('Vigente');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf('Interconsultas')).toBeLessThan(headings.indexOf('Recetas'));
    const cardNode = screen.getByRole('heading', { name: 'Recetas' });
    const timeline = screen.getByRole('list', { name: 'Historial del expediente' });
    expect(cardNode.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('quién ve los botones de la receta', () => {
  it('el médico que atiende ve "Reemplazar" e "Imprimir" solo en la vigente', async () => {
    server();
    mount();
    await ready('Vigente');
    expect(card().getAllByRole('button', { name: /^Reemplazar la receta/ })).toHaveLength(1);
    expect(card().getAllByRole('button', { name: /^Imprimir la receta/ })).toHaveLength(1);
    expect(within(card().getAllByRole('listitem')[0]).getByRole('button', { name: 'Reemplazar la receta del 10/09/2026 10:00' })).toBeInTheDocument();
    expect(within(card().getAllByRole('listitem')[1]).queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    ['sin la capacidad de emitir', { access: { reason: 'appointment' } as RecordAccess, caps: READ_CAPS, role: 'doctor' as Role }],
    ['por interconsulta', { access: { reason: 'referral', expiresAt: '2026-12-01 10:00:00' } as RecordAccess, caps: AUTHOR_CAPS, role: 'doctor' as Role }],
    ['como administración', { access: { reason: 'role' } as RecordAccess, caps: AUTHOR_CAPS, role: 'admin' as Role }],
  ])('%s: ve las recetas pero sin botones', async (_name, { access, caps, role }) => {
    server({ access });
    mount({ role, capabilities: caps });
    await ready('Vigente');
    expect(card().queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Emitir la receta/ })).not.toBeInTheDocument();
  });
});

describe('SeccionRecetas — cada botón depende de su propio permiso', () => {
  const load = { status: 'ready' as const, data: { rows: [CURRENT], access: 'appointment' as const }, error: null, reload: () => undefined };
  const show = (canAuthor: boolean, canPrint: boolean) =>
    renderConSesion(<SeccionRecetas prescriptions={load} canAuthor={canAuthor} canPrint={canPrint} onReplace={() => undefined} onPrint={() => undefined} />);

  it('solo imprimir: no hay "Reemplazar"', () => {
    show(false, true);
    expect(screen.getByRole('button', { name: /^Imprimir/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Reemplazar/ })).not.toBeInTheDocument();
  });

  it('solo reemplazar: no hay "Imprimir"', () => {
    show(true, false);
    expect(screen.getByRole('button', { name: /^Reemplazar/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Imprimir/ })).not.toBeInTheDocument();
  });

  it('ninguno: sin botones', () => {
    show(false, false);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('combinaciones de capacidades', () => {
  it('quien puede emitir pero no escribir notas ve "Emitir receta" sin "Enmendar"', async () => {
    server();
    mount({ capabilities: ['patients_search', 'medical_records_read', 'prescriptions_read', 'prescriptions_author'] });
    await ready('Vigente');
    expect(entryOf('Miopía leve').getByRole('button', { name: /^Emitir la receta/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Enmendar/ })).not.toBeInTheDocument();
  });

  it('quien puede escribir notas pero no emitir ve "Enmendar" sin "Emitir receta"', async () => {
    server();
    mount({ capabilities: READ_CAPS });
    await ready('Vigente');
    expect(entryOf('Miopía leve').getByRole('button', { name: /^Enmendar/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Emitir/ })).not.toBeInTheDocument();
  });

  it('si los datos del paciente no cargaron, no se ofrece imprimir (sí reemplazar)', async () => {
    server({ override: (r) => (r.url === '/pacientes/p1' ? { status: 500 } : undefined) });
    mount();
    await ready('Vigente');
    expect(card().queryByRole('button', { name: /^Imprimir/ })).not.toBeInTheDocument();
    expect(card().getByRole('button', { name: /^Reemplazar/ })).toBeInTheDocument();
  });
});

describe('emitir una receta desde la nota', () => {
  it('"Emitir receta" aparece solo en mis notas de consulta que todavía no tienen la suya', async () => {
    server();
    mount();
    await ready('Vigente');
    expect(screen.getAllByRole('button', { name: /^Emitir la receta/ })).toHaveLength(1);
    expect(entryOf('Miopía leve').getByRole('button', { name: 'Emitir la receta de la nota del 05/10/2026 09:40' })).toBeInTheDocument();
    expect(entryOf('Astigmatismo').queryByRole('button', { name: /Emitir/ })).not.toBeInTheDocument(); // ya tiene
    expect(entryOf('Control de otra doctora').queryByRole('button', { name: /Emitir/ })).not.toBeInTheDocument(); // es de otra
    expect(entryOf('Miopía moderada').queryByRole('button', { name: /Emitir/ })).not.toBeInTheDocument(); // enmienda
  });

  it('una nota con receta reemplazada también cuenta como "ya tiene"', async () => {
    server({ prescriptions: [{ ...CURRENT, record_id: 'n1' }, { ...REPLACED, record_id: 'n1' }] });
    mount();
    await ready('Vigente');
    expect(entryOf('Miopía leve').queryByRole('button', { name: /Emitir/ })).not.toBeInTheDocument();
    expect(entryOf('Astigmatismo').getByRole('button', { name: /Emitir/ })).toBeInTheDocument();
  });

  it('mientras no se hayan cargado las recetas no se ofrece emitir (podría ya tenerla)', async () => {
    server({ override: (r) => (r.url === '/pacientes/p1/recetas' ? { status: 500 } : undefined) });
    mount();
    await ready('No se pudieron cargar las recetas.');
    expect(screen.queryByRole('button', { name: /Emitir/ })).not.toBeInTheDocument();
  });

  it('sin permiso de emitir no hay botón en las notas', async () => {
    server();
    mount({ capabilities: READ_CAPS });
    await ready('Vigente');
    expect(screen.queryByRole('button', { name: /Emitir/ })).not.toBeInTheDocument();
  });

  async function openIssue() {
    await ready('Vigente');
    await userEvent.click(screen.getByRole('button', { name: /^Emitir la receta/ }));
    await dlg().findByRole('group', { name: /Ojo derecho/ });
  }

  it('abre la ventana vacía, con la consulta de la que sale la receta y el aviso de que no se edita', async () => {
    server();
    mount();
    await openIssue();
    expect(screen.getByRole('dialog', { name: 'Nueva receta' })).toBeInTheDocument();
    expect(dlg().getByText('Receta de la consulta del 05/10/2026 09:00: Miopía leve')).toBeInTheDocument();
    expect(dlg().getByText(/no se puede editar ni borrar/)).toBeInTheDocument();
    for (const name of [/Ojo derecho/, /Ojo izquierdo/]) {
      for (const field of ['Esfera', 'Cilindro', 'Eje', 'Adición']) expect(eyeBox(name).getByLabelText(field)).toHaveValue('');
    }
    expect(dlg().getByLabelText('Distancia pupilar (mm)')).toHaveValue('');
    expect(dlg().getByLabelText('Nota para el taller')).toHaveValue('');
  });

  it('envía la nota, las medidas como números y lo vacío como null; avisa, cierra y recarga las recetas', async () => {
    const received = server();
    mount();
    await openIssue();
    await userEvent.type(eyeBox(/Ojo derecho/).getByLabelText('Esfera'), '-2,25');
    await userEvent.type(eyeBox(/Ojo derecho/).getByLabelText('Cilindro'), '-0.75');
    await userEvent.type(eyeBox(/Ojo derecho/).getByLabelText('Eje'), '90');
    await userEvent.type(eyeBox(/Ojo derecho/).getByLabelText('Adición'), '1.5');
    await userEvent.type(eyeBox(/Ojo izquierdo/).getByLabelText('Esfera'), '0');
    await userEvent.type(dlg().getByLabelText('Distancia pupilar (mm)'), '62.5');
    await userEvent.type(dlg().getByLabelText('Nota para el taller'), '  Antirreflejo ');
    await userEvent.click(dlg().getByRole('button', { name: 'Emitir receta' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const post = received.find((r) => r.method === 'post');
    expect(post).toMatchObject({
      url: '/pacientes/p1/recetas',
      body: {
        record_id: 'n1',
        od_sphere: -2.25, od_cylinder: -0.75, od_axis: 90, od_addition: 1.5,
        oi_sphere: 0, oi_cylinder: null, oi_axis: null, oi_addition: null,
        pupillary_distance: 62.5, lens_notes: 'Antirreflejo',
      },
    });
    expect(await screen.findByText('Receta emitida.')).toBeInTheDocument();
    expect(rxGets(received)).toHaveLength(2);
  });

  it('valida en pantalla, sin llamar al servidor, y deja lo escrito', async () => {
    const received = server();
    mount();
    await openIssue();
    await userEvent.click(dlg().getByRole('button', { name: 'Emitir receta' }));
    expect(await dlg().findByText('Indique las medidas de al menos un ojo.')).toBeInTheDocument();
    await userEvent.type(eyeBox(/Ojo derecho/).getByLabelText('Esfera'), '-1.1');
    await userEvent.click(dlg().getByRole('button', { name: 'Emitir receta' }));
    expect(await dlg().findByText('La esfera del ojo derecho debe estar entre -20 y 20, de 0.25 en 0.25.')).toBeInTheDocument();
    expect(received.filter((r) => r.method === 'post')).toHaveLength(0);
    expect(eyeBox(/Ojo derecho/).getByLabelText('Esfera')).toHaveValue('-1.1');
  });

  it('si el servidor la rechaza, muestra su mensaje y la ventana sigue abierta con lo escrito', async () => {
    server({
      override: (r) =>
        r.method === 'post' ? { status: 409, data: { success: false, message: 'Esa consulta ya tiene su receta. Para corregirla, emita una que la reemplace.' } } : undefined,
    });
    mount();
    await openIssue();
    await userEvent.type(eyeBox(/Ojo derecho/).getByLabelText('Esfera'), '-1');
    await userEvent.click(dlg().getByRole('button', { name: 'Emitir receta' }));
    expect(await dlg().findByText(/Esa consulta ya tiene su receta/)).toBeInTheDocument();
    expect(eyeBox(/Ojo derecho/).getByLabelText('Esfera')).toHaveValue('-1');
    expect(dlg().getByRole('button', { name: 'Emitir receta' })).toBeEnabled();
  });

  it('sin mensaje del servidor muestra uno general', async () => {
    server({ override: (r) => (r.method === 'post' ? { status: 500 } : undefined) });
    mount();
    await openIssue();
    await userEvent.type(eyeBox(/Ojo derecho/).getByLabelText('Esfera'), '-1');
    await userEvent.click(dlg().getByRole('button', { name: 'Emitir receta' }));
    expect(await dlg().findByText('No se pudo guardar la receta.')).toBeInTheDocument();
  });

  it('el primer campo (esfera del ojo derecho) arranca con el foco', async () => {
    server();
    mount();
    await openIssue();
    await waitFor(() => expect(eyeBox(/Ojo derecho/).getByLabelText('Esfera')).toHaveFocus());
  });

  it('al reintentar, el error anterior desaparece mientras se guarda', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let posts = 0;
    server({
      override: async (r) => {
        if (r.method !== 'post') return undefined;
        if (++posts === 1) return { status: 500 };
        await gate;
        return undefined;
      },
    });
    mount();
    await openIssue();
    await userEvent.type(eyeBox(/Ojo derecho/).getByLabelText('Esfera'), '-1');
    await userEvent.click(dlg().getByRole('button', { name: 'Emitir receta' }));
    await dlg().findByText('No se pudo guardar la receta.');
    await userEvent.click(dlg().getByRole('button', { name: 'Emitir receta' }));
    await dlg().findByRole('button', { name: 'Guardando...' });
    expect(dlg().queryByText('No se pudo guardar la receta.')).not.toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('un clic fuera de la ventana NO la cierra; "Cancelar" sí, sin enviar nada', async () => {
    const received = server();
    mount();
    await openIssue();
    fireEvent.click(screen.getByTestId('fondo-dialogo'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(dlg().getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(received.filter((r) => r.method === 'post')).toHaveLength(0);
  });

  it('el aviso del guardado anterior desaparece al abrir otra receta', async () => {
    server();
    mount();
    await openIssue();
    await userEvent.type(eyeBox(/Ojo derecho/).getByLabelText('Esfera'), '-1');
    await userEvent.click(dlg().getByRole('button', { name: 'Emitir receta' }));
    await screen.findByText('Receta emitida.');
    await userEvent.click(within(card().getAllByRole('listitem')[0]).getByRole('button', { name: /^Reemplazar/ }));
    await dlg().findByRole('group', { name: /Ojo derecho/ });
    expect(screen.queryByText('Receta emitida.')).not.toBeInTheDocument();
  });
});

describe('reemplazar una receta', () => {
  async function openReplace() {
    await ready('Vigente');
    await userEvent.click(screen.getByRole('button', { name: /^Reemplazar la receta/ }));
    await dlg().findByRole('group', { name: /Ojo derecho/ });
  }

  it('abre con las medidas de la receta que se corrige', async () => {
    server();
    mount();
    await openReplace();
    expect(screen.getByRole('dialog', { name: 'Reemplazar receta' })).toBeInTheDocument();
    expect(dlg().getByText(/Esta receta reemplaza a la del 10\/09\/2026/)).toBeInTheDocument();
    expect(eyeBox(/Ojo derecho/).getByLabelText('Esfera')).toHaveValue('-2.25');
    expect(eyeBox(/Ojo derecho/).getByLabelText('Cilindro')).toHaveValue('-0.75');
    expect(eyeBox(/Ojo derecho/).getByLabelText('Eje')).toHaveValue('90');
    expect(eyeBox(/Ojo derecho/).getByLabelText('Adición')).toHaveValue('1.5');
    expect(eyeBox(/Ojo izquierdo/).getByLabelText('Esfera')).toHaveValue('0');
    expect(eyeBox(/Ojo izquierdo/).getByLabelText('Cilindro')).toHaveValue('');
    expect(dlg().getByLabelText('Distancia pupilar (mm)')).toHaveValue('62.5');
    expect(dlg().getByLabelText('Nota para el taller')).toHaveValue('Antirreflejo');
  });

  it('envía las medidas completas a la dirección de reemplazos (sin la nota), avisa, cierra y recarga', async () => {
    const received = server();
    mount();
    await openReplace();
    const sphere = eyeBox(/Ojo derecho/).getByLabelText('Esfera');
    await userEvent.clear(sphere);
    await userEvent.type(sphere, '-2.50');
    await userEvent.click(dlg().getByRole('button', { name: 'Reemplazar receta' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const post = received.find((r) => r.method === 'post')!;
    expect(post.url).toBe('/pacientes/p1/recetas/r2/reemplazos');
    expect(post.body).toEqual({
      od_sphere: -2.5, od_cylinder: -0.75, od_axis: 90, od_addition: 1.5,
      oi_sphere: 0, oi_cylinder: null, oi_axis: null, oi_addition: null,
      pupillary_distance: 62.5, lens_notes: 'Antirreflejo',
    });
    expect(await screen.findByText('Receta reemplazada: la nueva quedó vigente.')).toBeInTheDocument();
    expect(rxGets(received)).toHaveLength(2);
  });

  it('si ya la reemplazó otro, muestra el mensaje del servidor y deja la ventana abierta', async () => {
    server({ override: (r) => (r.method === 'post' ? { status: 409, data: { success: false, message: 'Esa receta ya fue reemplazada.' } } : undefined) });
    mount();
    await openReplace();
    await userEvent.click(dlg().getByRole('button', { name: 'Reemplazar receta' }));
    expect(await dlg().findByText('Esa receta ya fue reemplazada.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('un reemplazo con un dato inválido no se envía', async () => {
    const received = server();
    mount();
    await openReplace();
    await userEvent.clear(eyeBox(/Ojo derecho/).getByLabelText('Eje'));
    await userEvent.click(dlg().getByRole('button', { name: 'Reemplazar receta' }));
    expect(await dlg().findByText('Indique el eje del ojo derecho: tiene cilindro.')).toBeInTheDocument();
    expect(received.filter((r) => r.method === 'post')).toHaveLength(0);
  });

  it('abrir otra receta después no arrastra lo escrito en la anterior', async () => {
    server();
    mount();
    await openReplace();
    await userEvent.type(dlg().getByLabelText('Distancia pupilar (mm)'), '0');
    await userEvent.click(dlg().getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(screen.getByRole('button', { name: /^Reemplazar la receta/ }));
    await dlg().findByRole('group', { name: /Ojo derecho/ });
    expect(dlg().getByLabelText('Distancia pupilar (mm)')).toHaveValue('62.5');
  });
});

describe('el aviso al reemplazar', () => {
  it('desaparece al abrir "Emitir receta"', async () => {
    server();
    mount();
    await ready('Vigente');
    await userEvent.click(screen.getByRole('button', { name: /^Reemplazar la receta/ }));
    await dlg().findByRole('group', { name: /Ojo derecho/ });
    await userEvent.click(dlg().getByRole('button', { name: 'Reemplazar receta' }));
    await screen.findByText('Receta reemplazada: la nueva quedó vigente.');
    await userEvent.click(screen.getByRole('button', { name: /^Emitir la receta/ }));
    await dlg().findByRole('group', { name: /Ojo derecho/ });
    expect(screen.queryByText('Receta reemplazada: la nueva quedó vigente.')).not.toBeInTheDocument();
  });
});

describe('imprimir la receta', () => {
  it('abre la impresión con la receta vigente, sin pedir nada más al servidor', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const received = server();
    mount();
    await ready('Vigente');
    const before = received.length;
    await userEvent.click(screen.getByRole('button', { name: /^Imprimir la receta/ }));
    const sheet = within(await screen.findByLabelText('Receta para imprimir'));
    expect(print).toHaveBeenCalledTimes(1);
    expect(received.length).toBe(before);
    expect(sheet.getByText('Clínicas y Ópticas Candray')).toBeInTheDocument();
    expect(sheet.getByRole('heading', { name: 'Receta óptica' })).toBeInTheDocument();
    expect(sheet.getByText('Ana Pérez · Expediente N.º 101 · Nacimiento 20/05/1990')).toBeInTheDocument();
    expect(sheet.getByText('Emitida el 10/09/2026 10:00 · Candray Central')).toBeInTheDocument();
    expect(sheet.getByRole('row', { name: /Derecho/ })).toHaveTextContent('-2.25-0.7590°+1.50');
    expect(sheet.getByText('62.5 mm')).toBeInTheDocument();
    expect(sheet.getByText('Alejandro Mejía')).toBeInTheDocument();
    expect(sheet.getByText('Firma del médico')).toBeInTheDocument();
    expect(sheet.queryByRole('button')).not.toBeInTheDocument();
  });

  it('solo se ve al imprimir y el resto de la página se oculta', async () => {
    vi.spyOn(window, 'print').mockImplementation(() => undefined);
    server();
    mount();
    await ready('Vigente');
    await userEvent.click(screen.getByRole('button', { name: /^Imprimir la receta/ }));
    expect(await screen.findByLabelText('Receta para imprimir')).toHaveClass('hidden', 'print:block');
    expect(screen.getByRole('link', { name: /Volver a pacientes/ }).parentElement).toHaveClass('print:hidden');
  });

  it('no existe hasta que se pide, y al terminar la impresión se descarta', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    server();
    mount();
    await ready('Vigente');
    expect(screen.queryByLabelText('Receta para imprimir')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Imprimir la receta/ }));
    await screen.findByLabelText('Receta para imprimir');
    fireEvent(window, new Event('afterprint'));
    await waitFor(() => expect(screen.queryByLabelText('Receta para imprimir')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^Imprimir la receta/ }));
    await screen.findByLabelText('Receta para imprimir');
    expect(print).toHaveBeenCalledTimes(2);
  });

  it('imprimir la receta no pide el expediente para imprimir ni dibuja ese documento', async () => {
    vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const received = server();
    mount({ capabilities: [...AUTHOR_CAPS, 'medical_records_output'] });
    await ready('Vigente');
    await userEvent.click(screen.getByRole('button', { name: /^Imprimir la receta/ }));
    await screen.findByLabelText('Receta para imprimir');
    expect(received.some((r) => r.url.endsWith('/impresion'))).toBe(false);
    expect(screen.queryByLabelText('Documento para imprimir')).not.toBeInTheDocument();
  });
});
