// =============================================================================
// PaginaAuditoria.prueba.tsx
// Qué prueba:   la pantalla de auditoría de punta a punta con una API falsa: la
//               lista legible, estados vacíos y de error, filtros (y que
//               vuelven a la página 1), páginas, rango de fechas al revés y el
//               comportamiento mientras carga otra página.
// Cómo:         cliente real + ayudas/apiFalsa.ts; sesión de ayudas/conSesion.tsx.
// =============================================================================
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PaginaAuditoria } from '../../src/paginas/auditoria/PaginaAuditoria';
import type { AuditEntry, AuditPagination } from '../../src/servicios/auditoria';
import { installFakeApi, type RecordedRequest } from '../ayudas/apiFalsa';
import { renderConSesion } from '../ayudas/conSesion';

const ENTRY: AuditEntry = {
  id: 'a1', created_at: '2026-11-13 14:05:09.123456', entity_type: 'user', action: 'user_updated', entity_id: 'u9',
  actor_id: 'u1', actor_name: 'Ana Martínez', actor_email: 'ana@candray.test', branch_id: 'b1',
  branch_name: 'Candray Central', detail: { role: { from: 'doctor', to: 'recepcionista' } },
};
const FALLIDO: AuditEntry = {
  id: 'a2', created_at: '2026-11-13 09:30:00', entity_type: 'auth', action: 'login_failed', entity_id: null,
  actor_id: null, actor_name: null, actor_email: null, branch_id: null, branch_name: null,
  detail: { email: 'nadie@candray.test', reason: 'unknown_user', ip: '10.0.0.5' },
};
const FACETS = { entity_types: ['auth', 'user'], actions: ['login_failed', 'user_updated'] };

const pagination = (page: number, totalPages = 1, total = 2): AuditPagination => ({
  page, page_size: 25, total, total_pages: totalPages,
});

type Reply = { status: number; data?: unknown } | undefined | Promise<{ status: number; data?: unknown }>;
function server(overrides: (request: RecordedRequest) => Reply = () => undefined) {
  return installFakeApi((request) => {
    const custom = overrides(request);
    if (custom !== undefined) return custom;
    if (request.url === '/auditoria/filtros') return { status: 200, data: { data: FACETS } };
    if (request.url === '/auditoria') return { status: 200, data: { data: [ENTRY, FALLIDO], pagination: pagination(1) } };
    return { status: 404 };
  });
}

const mount = () => renderConSesion(<PaginaAuditoria />, { role: 'directivo', capabilities: ['audit_read'] });
const row = (text: string) => screen.getByText(text).closest('tr')!;
const listCalls = (received: RecordedRequest[]) => received.filter((r) => r.url === '/auditoria');
const lastParams = (received: RecordedRequest[]) => listCalls(received).at(-1)!.params;

describe('PaginaAuditoria — lista', () => {
  it('muestra cada entrada en español: fecha, quién, acción, tipo, sucursal y detalle', async () => {
    server();
    mount();
    await screen.findByText('Ana Martínez');
    const fila = within(row('Ana Martínez'));
    expect(fila.getByText('13/11/2026 14:05')).toBeInTheDocument();
    expect(fila.getByText('ana@candray.test')).toBeInTheDocument();
    expect(fila.getByText('Usuario modificado')).toBeInTheDocument();
    expect(fila.getByText('Usuario')).toBeInTheDocument();
    expect(fila.getByText('Candray Central')).toBeInTheDocument();
    expect(fila.getByText('Rol: Médico → Recepción')).toBeInTheDocument();
  });

  it('una acción sin usuario dice "Sin usuario" y muestra su detalle sin datos internos', async () => {
    server();
    mount();
    await screen.findByText('Sin usuario');
    const fila = within(row('Sin usuario'));
    expect(fila.getByText('Inicio de sesión fallido')).toBeInTheDocument();
    expect(fila.getByText('Acceso')).toBeInTheDocument();
    expect(fila.getByText('Correo: nadie@candray.test')).toBeInTheDocument();
    expect(fila.getByText('IP: 10.0.0.5')).toBeInTheDocument();
    expect(fila.getByText('—')).toBeInTheDocument(); // sin sucursal
  });

  it('la tabla tiene nombre accesible y la primera consulta es la página 1 sin filtros', async () => {
    const received = server();
    mount();
    expect(await screen.findByRole('table', { name: 'Bitácora de auditoría' })).toBeInTheDocument();
    expect(lastParams(received)).toEqual({ page: 1, page_size: 25 });
  });

  it('sin registros y sin filtros lo dice con palabras', async () => {
    server((r) => (r.url === '/auditoria' ? { status: 200, data: { data: [], pagination: pagination(1, 0, 0) } } : undefined));
    mount();
    expect(await screen.findByText('Todavía no hay registros en la bitácora.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).not.toBeInTheDocument();
  });

  it('un error muestra el mensaje y Reintentar vuelve a pedir', async () => {
    let fail = true;
    const received = server((r) =>
      r.url === '/auditoria' && fail ? { status: 500, data: { success: false, message: 'Falla del servidor.' } } : undefined,
    );
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Falla del servidor.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ana Martínez')).toBeInTheDocument();
    expect(listCalls(received)).toHaveLength(2);
  });

  it('si fallan los desplegables la lista igual funciona', async () => {
    server((r) => (r.url === '/auditoria/filtros' ? { status: 500 } : undefined));
    mount();
    expect(await screen.findByText('Ana Martínez')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toBeInTheDocument();
  });
});

describe('PaginaAuditoria — filtros', () => {
  it('los desplegables muestran nombres en español y guardan el código', async () => {
    server();
    mount();
    await screen.findByText('Ana Martínez');
    const accion = screen.getByRole('combobox', { name: 'Acción' });
    await waitFor(() => expect(within(accion).getByRole('option', { name: 'Usuario modificado' })).toHaveValue('user_updated'));
    expect(within(screen.getByRole('combobox', { name: 'Tipo' })).getByRole('option', { name: 'Acceso' })).toHaveValue('auth');
  });

  it('elegir un filtro consulta con ese parámetro y "Quitar filtros" los limpia', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Martínez');
    const quitar = screen.getByRole('button', { name: 'Quitar filtros' });
    expect(quitar).toBeDisabled();

    await waitFor(() => expect(within(screen.getByRole('combobox', { name: 'Tipo' })).getAllByRole('option')).toHaveLength(3));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'user');
    await waitFor(() => expect(lastParams(received)).toMatchObject({ entity_type: 'user' }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } });
    await waitFor(() => expect(lastParams(received)).toMatchObject({ entity_type: 'user', from: '2026-11-01' }));

    expect(quitar).toBeEnabled();
    await userEvent.click(quitar);
    await waitFor(() => expect(lastParams(received)).toEqual({ page: 1, page_size: 25 }));
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toHaveValue('');
    expect(screen.getByLabelText('Desde')).toHaveValue('');
  });

  it('sin resultados con filtros lo dice distinto que sin registros', async () => {
    server((r) =>
      r.url === '/auditoria' && r.params?.action === 'login_failed'
        ? { status: 200, data: { data: [], pagination: pagination(1, 0, 0) } }
        : undefined,
    );
    mount();
    await screen.findByText('Ana Martínez');
    await waitFor(() => expect(within(screen.getByRole('combobox', { name: 'Acción' })).getAllByRole('option')).toHaveLength(3));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Acción' }), 'login_failed');
    expect(await screen.findByText('No hay registros con esos filtros.')).toBeInTheDocument();
  });

  it('un rango al revés avisa y NO consulta al servidor; al corregirlo vuelve a consultar', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Martínez');
    const antes = listCalls(received).length;

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-20' } });
    await waitFor(() => expect(listCalls(received).length).toBe(antes + 1)); // solo "desde": válido
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-10' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('La fecha “Desde” no puede ser posterior a “Hasta”.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // la consulta con el rango al revés se omitió: el servidor no vio ese pedido
    expect(listCalls(received).some((r) => r.params?.from === '2026-11-20' && r.params?.to === '2026-11-10')).toBe(false);

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-25' } });
    await waitFor(() => expect(lastParams(received)).toMatchObject({ from: '2026-11-20', to: '2026-11-25' }));
    expect(await screen.findByText('Ana Martínez')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('las fechas tienen límites: el año no puede pasar de 4 dígitos', async () => {
    server();
    mount();
    await screen.findByText('Ana Martínez');
    for (const name of ['Desde', 'Hasta']) {
      expect(screen.getByLabelText(name)).toHaveAttribute('max', '9999-12-31');
      expect(screen.getByLabelText(name)).toHaveAttribute('min', '2000-01-01');
    }
  });

  it('desde y hasta iguales es un rango válido (un solo día)', async () => {
    const received = server();
    mount();
    await screen.findByText('Ana Martínez');
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-13' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-13' } });
    await waitFor(() => expect(lastParams(received)).toMatchObject({ from: '2026-11-13', to: '2026-11-13' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('PaginaAuditoria — páginas', () => {
  const byPage = (r: RecordedRequest): Reply => {
    if (r.url !== '/auditoria') return undefined;
    const page = Number(r.params?.page);
    const entry = { ...ENTRY, id: `p${page}`, actor_name: `Persona de la página ${page}` };
    return { status: 200, data: { data: [entry], pagination: pagination(page, 3, 60) } };
  };

  it('muestra el resumen y navega con Siguiente y Anterior', async () => {
    const received = server(byPage);
    mount();
    await screen.findByText('Persona de la página 1');
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toHaveTextContent('Página 1 de 3 · 60 registros');
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByText('Persona de la página 2');
    expect(lastParams(received)).toMatchObject({ page: 2 });
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toHaveTextContent('Página 2 de 3');

    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    await screen.findByText('Persona de la página 1');
    expect(lastParams(received)).toMatchObject({ page: 1 });
  });

  it('cambiar un filtro estando en la página 2 vuelve a la página 1', async () => {
    const received = server(byPage);
    mount();
    await screen.findByText('Persona de la página 1');
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByText('Persona de la página 2');

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } });
    await waitFor(() => expect(lastParams(received)).toMatchObject({ from: '2026-11-01', page: 1 }));
    expect(await screen.findByText('Persona de la página 1')).toBeInTheDocument();
  });

  it('mientras carga otra página conserva la tabla y apaga los botones', async () => {
    let release: (() => void) | undefined;
    server((r) => {
      if (r.url === '/auditoria' && Number(r.params?.page) === 2) {
        return new Promise((resolve) => {
          release = () => resolve({ status: 200, data: { data: [{ ...ENTRY, id: 'p2', actor_name: 'Llegó la 2' }], pagination: pagination(2, 3, 60) } });
        });
      }
      return byPage(r);
    });
    mount();
    await screen.findByText('Persona de la página 1');
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(screen.getByText('Persona de la página 1')).toBeInTheDocument(); // no parpadea
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    release?.();
    expect(await screen.findByText('Llegó la 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled();
  });
});
