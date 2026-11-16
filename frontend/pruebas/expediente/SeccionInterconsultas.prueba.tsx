// =============================================================================
// SeccionInterconsultas.prueba.tsx
// Qué prueba:   la sección de interconsultas del expediente: la lista con su
//               estado, quién ve "Revocar", dar una interconsulta (médicos
//               ofrecidos, validación, errores del servidor) y revocarla con
//               confirmación; y que la página solo la muestre a quien atiende
//               al paciente y tiene la capacidad.
// Cómo:         cliente real + ayudas/apiFalsa.ts; sesión de ayudas/conSesion.tsx
//               (el usuario de la sesión tiene id "u1").
// =============================================================================
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Capability } from '../../src/configuracion/capacidades';
import { PaginaExpediente } from '../../src/paginas/expediente/PaginaExpediente';
import { SeccionInterconsultas } from '../../src/paginas/expediente/SeccionInterconsultas';
import type { RecordAccess } from '../../src/servicios/expedientes';
import type { Referral } from '../../src/servicios/interconsultas';
import { installFakeApi, type RecordedRequest } from '../ayudas/apiFalsa';
import { renderConSesion } from '../ayudas/conSesion';

const BASE: Referral = {
  id: 'i1', patient_id: 'p1', provider_id: 'd2', provider_name: 'Dra. Rivas', granted_by: 'u1', granted_by_name: 'Dr. Mejía',
  reason: 'Segunda opinión', created_at: '2026-11-10 09:00:00', expires_at: '2026-11-24 09:00:00', revoked_at: null,
  revoked_by: null, status: 'active',
};
const MINE_ACTIVE = BASE;
const OTHERS_ACTIVE: Referral = { ...BASE, id: 'i2', provider_name: 'Dr. Portillo', granted_by: 'u9', granted_by_name: 'Dra. Otra' };
const EXPIRED: Referral = { ...BASE, id: 'i3', provider_name: 'Dr. Vencido', status: 'expired', expires_at: '2026-11-01 09:00:00' };
const REVOKED: Referral = {
  ...BASE, id: 'i4', provider_name: 'Dr. Revocado', status: 'revoked', revoked_at: '2026-11-12 10:30:00', revoked_by: 'u1',
};

type Reply = { status: number; data?: unknown } | undefined;
function server(options: { referrals?: Referral[]; candidates?: { id: string; full_name: string }[]; override?: (r: RecordedRequest) => Reply } = {}) {
  const { referrals = [MINE_ACTIVE, OTHERS_ACTIVE, EXPIRED, REVOKED], candidates = [{ id: 'd5', full_name: 'Dr. Candidato' }, { id: 'd6', full_name: 'Dra. Candidata' }], override = () => undefined } = options;
  return installFakeApi((request) => {
    const custom = override(request);
    if (custom !== undefined) return custom;
    if (request.method === 'get' && request.url === '/pacientes/p1/interconsultas') return { status: 200, data: { data: referrals } };
    if (request.method === 'get' && request.url === '/pacientes/p1/interconsultas/candidatos') return { status: 200, data: { data: candidates } };
    if (request.method === 'post' && request.url === '/pacientes/p1/interconsultas') return { status: 201, data: { data: { ...BASE, id: 'nueva', provider_name: 'Dr. Candidato' } } };
    if (request.method === 'post' && request.url.endsWith('/revocar')) return { status: 200, data: { data: REVOKED } };
    return { status: 404 };
  });
}

const mount = () => renderConSesion(<SeccionInterconsultas patientId="p1" />, { role: 'doctor', capabilities: ['referrals_manage'] });
const dlg = () => within(screen.getByRole('dialog'));
const itemOf = (name: string) => screen.getByText(name).closest('li')!;
const gets = (received: RecordedRequest[]) => received.filter((r) => r.method === 'get' && r.url === '/pacientes/p1/interconsultas');

describe('SeccionInterconsultas — la lista', () => {
  it('muestra a quién, motivo, quién la dio, fechas y estado de cada una', async () => {
    server();
    mount();
    await screen.findByText('Dra. Rivas');
    const mine = within(itemOf('Dra. Rivas'));
    expect(mine.getByText('Vigente')).toHaveClass('bg-exito-fondo');
    expect(mine.getByText('Segunda opinión')).toBeInTheDocument();
    expect(mine.getByText(/Dada por Dr\. Mejía el 10\/11\/2026 09:00 · vence el 24\/11\/2026 09:00/)).toBeInTheDocument();
    expect(within(itemOf('Dr. Vencido')).getByText('Vencida')).toBeInTheDocument();
    const revoked = within(itemOf('Dr. Revocado'));
    expect(revoked.getByText('Revocada')).toBeInTheDocument();
    expect(revoked.getByText(/revocada el 12\/11\/2026 10:30/)).toBeInTheDocument();
    expect(mine.queryByText(/revocada el/)).not.toBeInTheDocument(); // la vigente no habla de revocación
  });

  it('"Revocar" solo aparece en las vigentes que dio la misma persona', async () => {
    server();
    mount();
    await screen.findByText('Dra. Rivas');
    expect(screen.getAllByRole('button', { name: /^Revocar el acceso de/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Revocar el acceso de Dra. Rivas' })).toBeInTheDocument();
  });

  it('sin interconsultas lo dice', async () => {
    server({ referrals: [] });
    mount();
    expect(await screen.findByText('Nadie más tiene acceso a este expediente.')).toBeInTheDocument();
  });

  it('un fallo al cargar se puede reintentar', async () => {
    let fail = true;
    const received = server({ override: (r) => (r.url === '/pacientes/p1/interconsultas' && r.method === 'get' && fail ? { status: 500 } : undefined) });
    mount();
    await screen.findByText('No se pudieron cargar las interconsultas.');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Dra. Rivas');
    expect(gets(received)).toHaveLength(2);
  });
});

describe('SeccionInterconsultas — dar una interconsulta', () => {
  async function openForm() {
    await screen.findByText('Dra. Rivas');
    await userEvent.click(screen.getByRole('button', { name: /Dar interconsulta/ }));
    await dlg().findByRole('combobox', { name: /Médico/ });
  }

  it('ofrece los médicos candidatos y arranca con 14 días', async () => {
    server();
    mount();
    await openForm();
    expect(dlg().getAllByRole('option').map((o) => o.textContent)).toEqual(['Elija al médico', 'Dr. Candidato', 'Dra. Candidata']);
    expect(dlg().getByRole('spinbutton', { name: /Duración/ })).toHaveValue(14);
    expect(dlg().getByRole('spinbutton', { name: /Duración/ })).toHaveAttribute('min', '1');
    expect(dlg().getByRole('spinbutton', { name: /Duración/ })).toHaveAttribute('max', '30');
  });

  it('sin candidatos lo explica y no deja guardar', async () => {
    server({ candidates: [] });
    mount();
    await screen.findByText('Dra. Rivas');
    await userEvent.click(screen.getByRole('button', { name: /Dar interconsulta/ }));
    expect(await dlg().findByText(/No hay otro médico a quien darle acceso/)).toBeInTheDocument();
    expect(dlg().getByRole('button', { name: 'Dar interconsulta' })).toBeDisabled();
  });

  it('valida en pantalla sin llamar al servidor', async () => {
    const received = server();
    mount();
    await openForm();
    await userEvent.click(dlg().getByRole('button', { name: 'Dar interconsulta' }));
    expect(await dlg().findByText('Elija el médico que recibirá el acceso.')).toBeInTheDocument();
    await userEvent.selectOptions(dlg().getByRole('combobox', { name: /Médico/ }), 'd5');
    await userEvent.click(dlg().getByRole('button', { name: 'Dar interconsulta' }));
    expect(await dlg().findByText('Indique el motivo (mínimo 3 caracteres).')).toBeInTheDocument();
    expect(received.filter((r) => r.method === 'post')).toHaveLength(0);
  });

  it('envía médico, motivo y días; avisa, cierra y recarga la lista', async () => {
    const received = server();
    mount();
    await openForm();
    await userEvent.selectOptions(dlg().getByRole('combobox', { name: /Médico/ }), 'd5');
    await userEvent.type(dlg().getByRole('textbox', { name: /Motivo/ }), '  Valoración retina ');
    await userEvent.clear(dlg().getByRole('spinbutton', { name: /Duración/ }));
    await userEvent.type(dlg().getByRole('spinbutton', { name: /Duración/ }), '7');
    await userEvent.click(dlg().getByRole('button', { name: 'Dar interconsulta' }));
    await screen.findByText('Interconsulta dada a Dr. Candidato.');
    expect(received.filter((r) => r.method === 'post')[0]).toMatchObject({
      url: '/pacientes/p1/interconsultas',
      body: { provider_id: 'd5', reason: 'Valoración retina', days: 7 },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(gets(received)).toHaveLength(2);
  });

  it('si el servidor la rechaza muestra su mensaje y la ventana sigue abierta', async () => {
    server({ override: (r) => (r.method === 'post' ? { status: 409, data: { success: false, message: 'Ese médico ya tiene una interconsulta vigente sobre este paciente.' } } : undefined) });
    mount();
    await openForm();
    await userEvent.selectOptions(dlg().getByRole('combobox', { name: /Médico/ }), 'd5');
    await userEvent.type(dlg().getByRole('textbox', { name: /Motivo/ }), 'Opinión');
    await userEvent.click(dlg().getByRole('button', { name: 'Dar interconsulta' }));
    expect(await dlg().findByText(/ya tiene una interconsulta vigente/)).toBeInTheDocument();
    expect(dlg().getByRole('textbox', { name: /Motivo/ })).toHaveValue('Opinión');
  });
});

describe('SeccionInterconsultas — revocar', () => {
  const askRevoke = async () => {
    await screen.findByText('Dra. Rivas');
    await userEvent.click(screen.getByRole('button', { name: 'Revocar el acceso de Dra. Rivas' }));
  };

  it('pide confirmación y, al confirmar, revoca ESA interconsulta, avisa y recarga', async () => {
    const received = server();
    mount();
    await askRevoke();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Dra. Rivas dejará de poder ver este expediente de inmediato.');
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revocar' }));
    await screen.findByText('Se revocó el acceso de Dra. Rivas.');
    expect(received.filter((r) => r.method === 'post')[0].url).toBe('/pacientes/p1/interconsultas/i1/revocar');
    expect(gets(received)).toHaveLength(2);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(); // la confirmación ya se cerró
  });

  it('los avisos anteriores se limpian al abrir una ventana nueva', async () => {
    server();
    mount();
    await askRevoke();
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revocar' }));
    await screen.findByText('Se revocó el acceso de Dra. Rivas.');
    await userEvent.click(screen.getByRole('button', { name: /Dar interconsulta/ }));
    expect(screen.queryByText('Se revocó el acceso de Dra. Rivas.')).not.toBeInTheDocument();
  });

  it('un error anterior se limpia al abrir "Dar interconsulta" y un aviso al intentar revocar otra vez', async () => {
    let fail = true;
    server({ override: (r) => (r.url.endsWith('/revocar') && fail ? { status: 409, data: { success: false, message: 'Esa interconsulta ya no está vigente.' } } : undefined) });
    mount();
    await askRevoke();
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revocar' }));
    await screen.findByText('Esa interconsulta ya no está vigente.');
    await userEvent.click(screen.getByRole('button', { name: /Dar interconsulta/ }));
    expect(screen.queryByText('Esa interconsulta ya no está vigente.')).not.toBeInTheDocument();
    await userEvent.click(dlg().getByRole('button', { name: 'Cancelar' }));
    fail = false;
    await askRevoke();
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revocar' }));
    await screen.findByText('Se revocó el acceso de Dra. Rivas.');
    expect(screen.queryByText('Esa interconsulta ya no está vigente.')).not.toBeInTheDocument();
  });

  it('cancelar no revoca nada', async () => {
    const received = server();
    mount();
    await askRevoke();
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    expect(received.filter((r) => r.method === 'post')).toHaveLength(0);
  });

  it('si el servidor dice que ya no estaba vigente, lo muestra y recarga la lista', async () => {
    const received = server({ override: (r) => (r.url.endsWith('/revocar') ? { status: 409, data: { success: false, message: 'Esa interconsulta ya no está vigente.' } } : undefined) });
    mount();
    await askRevoke();
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revocar' }));
    expect(await screen.findByText('Esa interconsulta ya no está vigente.')).toBeInTheDocument();
    await waitFor(() => expect(gets(received)).toHaveLength(2));
  });
});

describe('PaginaExpediente — cuándo aparece la sección', () => {
  const ENTRY_PAGE = (access: RecordAccess) => ({ data: [], access, pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 } });
  function mountPage(access: RecordAccess, capabilities: Capability[]) {
    installFakeApi((request) => {
      if (request.url === '/pacientes/p1') return { status: 200, data: { data: { id: 'p1', record_number: 7, full_name: 'Ana Pérez', birth_date: '1990-05-20' } } };
      if (request.url === '/pacientes/p1/expediente') return { status: 200, data: ENTRY_PAGE(access) };
      if (request.url === '/pacientes/p1/interconsultas') return { status: 200, data: { data: [] } };
      return { status: 404 };
    });
    renderConSesion(
      <Routes><Route path="/pacientes/:patientId/expediente" element={<PaginaExpediente />} /></Routes>,
      { role: 'doctor', capabilities, route: '/pacientes/p1/expediente' },
    );
  }

  it('quien atiende al paciente y puede dar interconsultas la ve', async () => {
    mountPage({ reason: 'appointment' }, ['medical_records_read', 'referrals_manage']);
    expect(await screen.findByRole('heading', { name: 'Interconsultas' })).toBeInTheDocument();
  });

  it('sin la capacidad no la ve', async () => {
    mountPage({ reason: 'appointment' }, ['medical_records_read']);
    await screen.findByText('Este paciente todavía no tiene notas en su expediente.');
    expect(screen.queryByRole('heading', { name: 'Interconsultas' })).not.toBeInTheDocument();
  });

  it('quien entra por interconsulta no puede pasarla a otro: no la ve', async () => {
    mountPage({ reason: 'referral', expiresAt: '2026-12-01 10:00:00' }, ['medical_records_read', 'referrals_manage']);
    await screen.findByText('Este paciente todavía no tiene notas en su expediente.');
    expect(screen.queryByRole('heading', { name: 'Interconsultas' })).not.toBeInTheDocument();
  });
});
