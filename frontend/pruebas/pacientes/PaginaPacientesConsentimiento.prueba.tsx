// =============================================================================
// PaginaPacientesConsentimiento.prueba.tsx
// Qué prueba:   el consentimiento dentro de la pantalla de pacientes: quién ve el
//               botón "Consentimiento", la ventana (sin consentimiento, vigente,
//               historial), registrar con nota opcional, errores del servidor y
//               revocar con confirmación.
// Cómo:         cliente real + ayudas/apiFalsa.ts; sesión de ayudas/conSesion.tsx.
// =============================================================================
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Capability } from '../../src/configuracion/capacidades';
import type { Role } from '../../src/configuracion/roles';
import { PaginaPacientes } from '../../src/paginas/pacientes/PaginaPacientes';
import type { Consent } from '../../src/servicios/consentimientos';
import type { Patient } from '../../src/servicios/pacientes';
import { installFakeApi, type RecordedRequest } from '../ayudas/apiFalsa';
import { renderConSesion } from '../ayudas/conSesion';

const ANA: Patient = {
  id: 'p1', record_number: 101, full_name: 'Ana Pérez', birth_date: '1990-05-20', phone: '7000-1111',
  dui: null, email: null, is_active: true, created_at: '', updated_at: '',
};
const LUIS: Patient = { ...ANA, id: 'p2', record_number: 102, full_name: 'Luis Gómez' };

const ACTIVE: Consent = {
  id: 'c1', patient_id: 'p1', granted_by: 'u2', granted_by_name: 'Marta Recepción', note: 'Firmó el formulario',
  created_at: '2026-11-10 09:30:00', revoked_at: null, revoked_by: null, revoked_by_name: null, status: 'active',
};
const REVOKED: Consent = {
  ...ACTIVE, id: 'c0', note: null, created_at: '2026-10-01 08:00:00', revoked_at: '2026-10-20 15:45:00',
  revoked_by: 'u3', revoked_by_name: 'Dr. Mejía', status: 'revoked',
};

type Reply = { status: number; data?: unknown } | undefined;
function server(options: { consents?: Consent[]; override?: (r: RecordedRequest) => Reply } = {}) {
  const { consents = [], override = () => undefined } = options;
  return installFakeApi((request) => {
    const custom = override(request);
    if (custom !== undefined) return custom;
    if (request.method === 'get' && request.url === '/pacientes') {
      return { status: 200, data: { data: [ANA, LUIS], pagination: { page: 1, page_size: 25, total: 2, total_pages: 1 } } };
    }
    if (request.method === 'get' && request.url === '/pacientes/p1/consentimientos') return { status: 200, data: { data: consents } };
    if (request.method === 'post' && request.url === '/pacientes/p1/consentimientos') return { status: 201, data: { data: ACTIVE } };
    if (request.method === 'post' && request.url.endsWith('/revocar')) return { status: 200, data: { data: REVOKED } };
    return { status: 404 };
  });
}

function mount(role: Role = 'recepcionista', capabilities: Capability[] = ['patients_search', 'consents_manage']) {
  return renderConSesion(<PaginaPacientes />, { role, capabilities });
}
const dlg = () => within(screen.getByRole('dialog'));
const openConsent = async (name = 'Ana Pérez') => {
  await screen.findByText(name);
  await userEvent.click(screen.getByRole('button', { name: `Consentimiento de ${name}` }));
};
const posts = (received: RecordedRequest[]) => received.filter((r) => r.method === 'post');
const patientGets = (received: RecordedRequest[]) => received.filter((r) => r.method === 'get' && r.url === '/pacientes');

describe('botón "Consentimiento"', () => {
  it.each([
    ['recepcionista', ['patients_search', 'patients_manage', 'consents_manage']],
    ['doctor', ['patients_search', 'consents_manage']],
  ] as const)('%s lo ve en cada fila', async (role, capabilities) => {
    server();
    mount(role, [...capabilities]);
    await screen.findByText('Ana Pérez');
    expect(screen.getAllByRole('button', { name: /^Consentimiento de/ })).toHaveLength(2);
    expect(screen.getByRole('columnheader', { name: 'Acciones' })).toBeInTheDocument();
  });

  it('quien no tiene consents_manage no lo ve (ni la columna de acciones si no tiene nada más)', async () => {
    server();
    mount('encargado_venta', ['patients_search']);
    await screen.findByText('Ana Pérez');
    expect(screen.queryByRole('button', { name: /^Consentimiento de/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Acciones' })).not.toBeInTheDocument();
  });

  it('con solo esta capacidad, aparece la columna pero ningún botón de modificar', async () => {
    server();
    mount('doctor', ['patients_search', 'consents_manage']);
    await screen.findByText('Ana Pérez');
    expect(screen.queryByRole('button', { name: /Editar a|Desactivar a|Abrir el expediente/ })).not.toBeInTheDocument();
  });

  it.each([
    ['Ana Pérez', 'p1'],
    ['Luis Gómez', 'p2'],
  ])('abre la ventana del paciente de ESA fila (%s)', async (name, id) => {
    const received = server({
      override: (r) => (r.method === 'get' && r.url === '/pacientes/p2/consentimientos' ? { status: 200, data: { data: [] } } : undefined),
    });
    mount();
    await openConsent(name);
    expect(screen.getByRole('dialog', { name: `Consentimiento de ${name}` })).toBeInTheDocument();
    expect(received.some((r) => r.url === `/pacientes/${id}/consentimientos`)).toBe(true);
  });
});

describe('la ventana — sin consentimiento', () => {
  it('lo dice, explica para qué sirve y ofrece registrarlo con una nota opcional', async () => {
    server();
    mount();
    await openConsent();
    expect(await dlg().findByText('Sin consentimiento')).toBeInTheDocument();
    expect(dlg().getByText(/la óptica puede ver la receta/)).toBeInTheDocument();
    expect(dlg().getByRole('textbox', { name: /Cómo se obtuvo/ })).toBeInTheDocument();
    expect(dlg().getByRole('button', { name: 'Registrar consentimiento' })).toBeEnabled();
    expect(dlg().queryByRole('button', { name: 'Revocar' })).not.toBeInTheDocument();
  });

  it('registra sin nota (manda null), avisa, cierra y recarga la lista', async () => {
    const received = server();
    mount();
    await openConsent();
    await userEvent.click(await dlg().findByRole('button', { name: 'Registrar consentimiento' }));
    await screen.findByText('Consentimiento de Ana Pérez registrado.');
    expect(posts(received)[0]).toMatchObject({ url: '/pacientes/p1/consentimientos', body: { note: null } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(patientGets(received)).toHaveLength(2));
  });

  it('registra con la nota escrita, sin espacios sobrantes', async () => {
    const received = server();
    mount();
    await openConsent();
    await userEvent.type(await dlg().findByRole('textbox', { name: /Cómo se obtuvo/ }), '  Firmó en recepción ');
    await userEvent.click(dlg().getByRole('button', { name: 'Registrar consentimiento' }));
    await screen.findByText('Consentimiento de Ana Pérez registrado.');
    expect(posts(received)[0].body).toEqual({ note: 'Firmó en recepción' });
  });

  it('la nota no pasa de 200 caracteres y muestra el contador', async () => {
    server();
    mount();
    await openConsent();
    const note = await dlg().findByRole('textbox', { name: /Cómo se obtuvo/ });
    expect(note).toHaveAttribute('maxlength', '200');
    await userEvent.type(note, 'abc');
    expect(dlg().getByText('3 / 200')).toBeInTheDocument();
  });

  it('si el servidor lo rechaza, muestra su mensaje y la ventana sigue abierta con lo escrito', async () => {
    server({
      override: (r) =>
        r.method === 'post' ? { status: 409, data: { success: false, message: 'Este paciente ya tiene un consentimiento vigente.' } } : undefined,
    });
    mount();
    await openConsent();
    await userEvent.type(await dlg().findByRole('textbox', { name: /Cómo se obtuvo/ }), 'Nota');
    await userEvent.click(dlg().getByRole('button', { name: 'Registrar consentimiento' }));
    expect(await dlg().findByText('Este paciente ya tiene un consentimiento vigente.')).toBeInTheDocument();
    expect(dlg().getByRole('textbox', { name: /Cómo se obtuvo/ })).toHaveValue('Nota');
    expect(dlg().getByRole('button', { name: 'Registrar consentimiento' })).toBeEnabled();
  });

  it('al reintentar, el error anterior desaparece mientras se guarda', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let attempts = 0;
    installFakeApi(async (request) => {
      if (request.method === 'get' && request.url === '/pacientes') {
        return { status: 200, data: { data: [ANA], pagination: { page: 1, page_size: 25, total: 1, total_pages: 1 } } };
      }
      if (request.method === 'get') return { status: 200, data: { data: [] } };
      attempts += 1;
      if (attempts === 1) return { status: 409, data: { success: false, message: 'Este paciente ya tiene un consentimiento vigente.' } };
      await gate;
      return { status: 201, data: { data: ACTIVE } };
    });
    mount();
    await openConsent();
    await userEvent.click(await dlg().findByRole('button', { name: 'Registrar consentimiento' }));
    await dlg().findByText('Este paciente ya tiene un consentimiento vigente.');
    await userEvent.click(dlg().getByRole('button', { name: 'Registrar consentimiento' }));
    expect(dlg().queryByText('Este paciente ya tiene un consentimiento vigente.')).not.toBeInTheDocument();
    expect(dlg().getByRole('button', { name: 'Guardando...' })).toBeDisabled();
    release();
    await screen.findByText('Consentimiento de Ana Pérez registrado.');
  });

  it('un clic fuera de la ventana NO la cierra (no se pierde lo escrito)', async () => {
    server();
    mount();
    await openConsent();
    await dlg().findByText('Sin consentimiento');
    fireEvent.click(screen.getByTestId('fondo-dialogo'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('si no se pudo cargar, muestra el error y NO ofrece registrar', async () => {
    server({ override: (r) => (r.method === 'get' && r.url.endsWith('/consentimientos') ? { status: 500 } : undefined) });
    mount();
    await openConsent();
    expect(await dlg().findByText('No se pudo cargar el consentimiento.')).toBeInTheDocument();
    expect(dlg().queryByRole('button', { name: 'Registrar consentimiento' })).not.toBeInTheDocument();
  });
});

describe('la ventana — con consentimiento vigente', () => {
  it('muestra quién lo registró, cuándo y la nota, y ofrece revocar (no registrar)', async () => {
    server({ consents: [ACTIVE] });
    mount();
    await openConsent();
    const section = within(await dlg().findByRole('region', { name: 'Consentimiento vigente' }));
    expect(section.getByText('Vigente')).toHaveClass('bg-exito-fondo');
    expect(section.getByText(/Registrado por Marta Recepción el 10\/11\/2026/)).toBeInTheDocument();
    expect(section.getByText('Firmó el formulario')).toBeInTheDocument();
    expect(dlg().queryByRole('button', { name: 'Registrar consentimiento' })).not.toBeInTheDocument();
    expect(dlg().queryByText('Sin consentimiento')).not.toBeInTheDocument();
  });

  it('sin nota no escribe nada de nota', async () => {
    server({ consents: [{ ...ACTIVE, note: null }] });
    mount();
    await openConsent();
    const section = within(await dlg().findByRole('region', { name: 'Consentimiento vigente' }));
    expect(section.queryByText('null')).not.toBeInTheDocument();
    expect(section.getAllByText(/Registrado por/)).toHaveLength(1);
    expect(section.getByText(/Registrado por/).parentElement!.querySelectorAll('p')).toHaveLength(1); // sin párrafo de nota
  });

  it('"Revocar" cierra la ventana y pide confirmación (aún no revoca)', async () => {
    const received = server({ consents: [ACTIVE] });
    mount();
    await openConsent();
    await userEvent.click(await dlg().findByRole('button', { name: 'Revocar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const confirm = within(screen.getByRole('alertdialog'));
    expect(confirm.getByText('Revocar consentimiento')).toBeInTheDocument();
    expect(confirm.getByText('La óptica dejará de poder ver la receta de Ana Pérez.')).toBeInTheDocument();
    expect(confirm.getByRole('button', { name: 'Revocar' })).toHaveClass('border-marca'); // estilo de peligro
    expect(posts(received)).toHaveLength(0);
  });

  it('"Cancelar" en la confirmación no revoca nada', async () => {
    const received = server({ consents: [ACTIVE] });
    mount();
    await openConsent();
    await userEvent.click(await dlg().findByRole('button', { name: 'Revocar' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(posts(received)).toHaveLength(0);
  });

  it('al confirmar revoca ESE consentimiento, avisa y recarga la lista', async () => {
    const received = server({ consents: [ACTIVE] });
    mount();
    await openConsent();
    await userEvent.click(await dlg().findByRole('button', { name: 'Revocar' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revocar' }));
    await screen.findByText('Se revocó el consentimiento de Ana Pérez.');
    expect(posts(received)).toHaveLength(1);
    expect(posts(received)[0].url).toBe('/pacientes/p1/consentimientos/c1/revocar');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(patientGets(received)).toHaveLength(2));
  });

  it('si el servidor lo rechaza (ya estaba revocado) muestra su mensaje', async () => {
    server({
      consents: [ACTIVE],
      override: (r) =>
        r.url.endsWith('/revocar') ? { status: 409, data: { success: false, message: 'Ese consentimiento ya fue revocado.' } } : undefined,
    });
    mount();
    await openConsent();
    await userEvent.click(await dlg().findByRole('button', { name: 'Revocar' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revocar' }));
    expect(await screen.findByText('Ese consentimiento ya fue revocado.')).toBeInTheDocument();
    expect(screen.queryByText(/Se revocó el consentimiento/)).not.toBeInTheDocument();
  });

  it('abrir otra ventana limpia el aviso anterior', async () => {
    server({ consents: [ACTIVE] });
    mount();
    await openConsent();
    await userEvent.click(await dlg().findByRole('button', { name: 'Revocar' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revocar' }));
    await screen.findByText('Se revocó el consentimiento de Ana Pérez.');
    await userEvent.click(screen.getByRole('button', { name: 'Consentimiento de Luis Gómez' }));
    expect(screen.queryByText('Se revocó el consentimiento de Ana Pérez.')).not.toBeInTheDocument();
  });
});

describe('la ventana — historial', () => {
  it('lista los revocados con quién los registró y quién los revocó', async () => {
    server({ consents: [REVOKED] });
    mount();
    await openConsent();
    const past = within(await dlg().findByRole('region', { name: 'Consentimientos anteriores' }));
    expect(past.getByText('Revocado')).toHaveClass('bg-aviso-fondo');
    expect(past.getByText(/Registrado por Marta Recepción el 01\/10\/2026/)).toBeInTheDocument();
    expect(past.getByText(/Revocado por Dr. Mejía el 20\/10\/2026/)).toBeInTheDocument();
    // Solo hay revocados: se puede registrar uno nuevo.
    expect(dlg().getByRole('button', { name: 'Registrar consentimiento' })).toBeInTheDocument();
    expect(dlg().queryByRole('region', { name: 'Consentimiento vigente' })).not.toBeInTheDocument();
  });

  it('con uno vigente y uno anterior muestra los dos', async () => {
    server({ consents: [ACTIVE, REVOKED] });
    mount();
    await openConsent();
    expect(await dlg().findByRole('region', { name: 'Consentimiento vigente' })).toBeInTheDocument();
    expect(dlg().getByRole('region', { name: 'Consentimientos anteriores' })).toBeInTheDocument();
  });

  it('sin anteriores no aparece la sección de historial', async () => {
    server({ consents: [ACTIVE] });
    mount();
    await openConsent();
    await dlg().findByRole('region', { name: 'Consentimiento vigente' });
    expect(dlg().queryByRole('region', { name: 'Consentimientos anteriores' })).not.toBeInTheDocument();
  });
});
