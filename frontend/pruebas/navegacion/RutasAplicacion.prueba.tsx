// =============================================================================
// RutasAplicacion.prueba.tsx
// Qué prueba:   el control de acceso a las pantallas: quien abre a mano la
//               dirección de una pantalla que su rol no puede ver recibe un
//               aviso (no la pantalla), y una dirección inexistente da "no
//               encontrada". También que el marco (menú y encabezado) rodea todo.
// Cómo:         dibuja las rutas reales en un router en memoria.
// =============================================================================
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RutasAplicacion } from '../../src/navegacion/RutasAplicacion';
import { installFakeApi } from '../ayudas/apiFalsa';
import { renderConSesion } from '../ayudas/conSesion';

describe('RutasAplicacion', () => {
  it('"/" muestra el Inicio dentro del marco (encabezado, menú y contenido)', () => {
    renderConSesion(<RutasAplicacion />, { route: '/' });
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Bienvenido');
  });

  it('/auditoria abre la página real de la bitácora, no el aviso de construcción', async () => {
    installFakeApi((request) =>
      request.url === '/auditoria/filtros'
        ? { status: 200, data: { data: { entity_types: [], actions: [] } } }
        : { status: 200, data: { data: [], pagination: { page: 1, page_size: 25, total: 0, total_pages: 0 } } },
    );
    renderConSesion(<RutasAplicacion />, { route: '/auditoria', capabilities: ['audit_read'] });
    expect(screen.getByRole('heading', { level: 1, name: 'Auditoría' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Acción' })).toBeInTheDocument();
    expect(screen.queryByText('En construcción')).not.toBeInTheDocument();
    await screen.findByText(/Todavía no hay registros/); // deja terminar la carga
  });

  it('/sucursales abre la página real de sucursales, no el aviso de construcción', async () => {
    installFakeApi(() => ({ status: 200, data: { data: [] } }));
    renderConSesion(<RutasAplicacion />, { route: '/sucursales', capabilities: ['branches_manage'] });
    expect(screen.getByRole('heading', { level: 1, name: 'Sucursales' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nueva sucursal/ })).toBeInTheDocument();
    expect(screen.queryByText('En construcción')).not.toBeInTheDocument();
    await screen.findByText(/Todavía no hay sucursales/); // deja terminar la carga
  });

  it('/usuarios abre la página real de usuarios, no el aviso de construcción', async () => {
    installFakeApi(() => ({ status: 200, data: { data: [] } }));
    renderConSesion(<RutasAplicacion />, { route: '/usuarios', capabilities: ['users_manage'] });
    expect(screen.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nuevo usuario/ })).toBeInTheDocument();
    expect(screen.queryByText('En construcción')).not.toBeInTheDocument();
    await screen.findByText(/No hay usuarios que coincidan/); // deja terminar la carga
  });

  it('/pacientes abre la página real de pacientes, no el aviso de construcción', async () => {
    installFakeApi((request) =>
      request.url === '/pacientes'
        ? { status: 200, data: { data: [], pagination: { page: 1, page_size: 25, total: 0, total_pages: 0 } } }
        : { status: 404 },
    );
    renderConSesion(<RutasAplicacion />, { route: '/pacientes', capabilities: ['patients_search'] });
    expect(screen.getByRole('heading', { level: 1, name: 'Pacientes' })).toBeInTheDocument();
    expect(screen.queryByText('En construcción')).not.toBeInTheDocument();
    await screen.findByText(/Todavía no hay pacientes registrados/); // deja terminar la carga
  });

  it('/citas abre la página real de la agenda, no el aviso de construcción', async () => {
    installFakeApi(() => ({ status: 200, data: { data: [], pagination: { page: 1, page_size: 50, total: 0, total_pages: 0 } } }));
    renderConSesion(<RutasAplicacion />, { route: '/citas', capabilities: ['appointments_read'] });
    expect(screen.getByRole('heading', { level: 1, name: 'Citas' })).toBeInTheDocument();
    expect(screen.queryByText('En construcción')).not.toBeInTheDocument();
    await screen.findByText('No hay citas para este día.'); // deja terminar la carga
  });

  it('/ordenes-optica abre la página real de las órdenes, no el aviso de construcción', async () => {
    installFakeApi(() => ({ status: 200, data: { data: [], pagination: { page: 1, page_size: 25, total: 0, total_pages: 0 } } }));
    renderConSesion(<RutasAplicacion />, { route: '/ordenes-optica', capabilities: ['optical_orders_read'] });
    expect(screen.getByRole('heading', { level: 1, name: 'Órdenes de óptica' })).toBeInTheDocument();
    expect(screen.queryByText('En construcción')).not.toBeInTheDocument();
    await screen.findByText('Todavía no hay órdenes en esta sucursal.'); // deja terminar la carga
  });

  it('/panel abre el panel real, no el aviso de construcción', async () => {
    installFakeApi(() => ({ status: 200, data: { data: { as_of: '2026-11-16', totals: {}, branches: [] } } }));
    renderConSesion(<RutasAplicacion />, { route: '/panel', capabilities: ['dashboard_read'] });
    expect(screen.getByRole('heading', { level: 1, name: 'Panel de indicadores' })).toBeInTheDocument();
    expect(screen.queryByText('En construcción')).not.toBeInTheDocument();
    await screen.findByText('No hay sucursales activas para mostrar.'); // deja terminar la carga
  });

  it('/recordatorios abre la bandeja real, no el aviso de construcción', async () => {
    installFakeApi(() => ({ status: 200, data: { data: [] } }));
    renderConSesion(<RutasAplicacion />, { route: '/recordatorios', capabilities: ['reminders_read'] });
    expect(screen.getByRole('heading', { level: 1, name: 'Recordatorios' })).toBeInTheDocument();
    expect(screen.queryByText('En construcción')).not.toBeInTheDocument();
    await screen.findByText('No hay citas agendadas para hoy ni mañana en esta sucursal.');
  });

  it('/pacientes/:id/expediente abre la página real del expediente', async () => {
    installFakeApi((request) => {
      if (request.url === '/pacientes/p1') {
        return { status: 200, data: { data: { id: 'p1', record_number: 7, full_name: 'Ana Pérez', birth_date: '1990-05-20' } } };
      }
      return { status: 200, data: { data: [], access: { reason: 'appointment' }, pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 } } };
    });
    renderConSesion(<RutasAplicacion />, { route: '/pacientes/p1/expediente', capabilities: ['medical_records_read'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Pérez' })).toBeInTheDocument();
    await screen.findByText('Este paciente todavía no tiene notas en su expediente.');
  });

  it('sin medical_records_read, el expediente muestra "Sin acceso" y NO pide nada al servidor', () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [] } }));
    renderConSesion(<RutasAplicacion />, { route: '/pacientes/p1/expediente', capabilities: ['patients_search'] });
    expect(screen.getByRole('heading', { level: 1, name: 'Sin acceso' })).toBeInTheDocument();
    expect(received).toHaveLength(0);
  });

  it.each(['/citas', '/ordenes-optica', '/panel', '/recordatorios', '/pacientes', '/usuarios', '/sucursales', '/auditoria'])(
    'sin la capacidad, %s muestra "Sin acceso" y NO la pantalla',
    (path) => {
      renderConSesion(<RutasAplicacion />, { route: path, capabilities: [] });
      expect(screen.getByRole('heading', { level: 1, name: 'Sin acceso' })).toBeInTheDocument();
      expect(screen.queryByText('En construcción')).not.toBeInTheDocument();
    },
  );

  it('una capacidad ajena no abre la pantalla (auditoría no abre usuarios)', () => {
    renderConSesion(<RutasAplicacion />, { route: '/usuarios', capabilities: ['audit_read'] });
    expect(screen.getByRole('heading', { level: 1, name: 'Sin acceso' })).toBeInTheDocument();
  });

  it('una dirección que no existe muestra "Página no encontrada", dentro del marco', () => {
    renderConSesion(<RutasAplicacion />, { route: '/nada-por-aqui' });
    expect(screen.getByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('el enlace "Saltar al contenido" apunta al contenido principal', () => {
    renderConSesion(<RutasAplicacion />);
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute('href', '#contenido');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenido');
  });
});
