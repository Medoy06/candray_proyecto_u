// =============================================================================
// App.prueba.tsx
// Qué prueba:   el recorrido completo de punta a punta, con la sesión REAL (solo
//               la red es falsa): iniciar sesión, ver el menú que corresponde al
//               rol, navegar, cambiar de sucursal y cerrar sesión.
// =============================================================================
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';
import { SesionProvider } from '../../src/contexto/SesionProvider';
import type { LoginData } from '../../src/servicios/tiposSesion';
import { installFakeApi } from '../ayudas/apiFalsa';
import { ESCALON, LOGIN } from '../ayudas/datosSesion';

const ADMIN: LoginData = {
  ...LOGIN,
  user: { id: 'a1', full_name: 'Ana Martínez', email: 'admin@candray.test', role: 'admin' },
  capabilities: ['users_manage', 'branches_manage', 'audit_read'],
};

const mount = () =>
  render(
    <MemoryRouter>
      <SesionProvider>
        <App />
      </SesionProvider>
    </MemoryRouter>,
  );

async function iniciarSesion() {
  await userEvent.type(screen.getByLabelText('Correo electrónico'), 'admin@candray.test');
  await userEvent.type(screen.getByLabelText('Contraseña'), 'clave');
  await userEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
}

describe('App', () => {
  it('sin sesión muestra el acceso, no la aplicación', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Acceso al sistema' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('al iniciar sesión muestra el menú según las capacidades que publicó el servidor', async () => {
    installFakeApi(() => ({ status: 200, data: { success: true, data: ADMIN } }));
    mount();
    await iniciarSesion();
    expect(await screen.findByRole('heading', { level: 1, name: /Bienvenido, Ana Martínez/ })).toBeInTheDocument();
    for (const name of ['Inicio', 'Usuarios', 'Sucursales', 'Auditoría']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('un rol sin capacidades de administración no ve esas opciones', async () => {
    installFakeApi(() => ({ status: 200, data: { success: true, data: { ...ADMIN, capabilities: [] } } }));
    mount();
    await iniciarSesion();
    await screen.findByRole('heading', { level: 1, name: /Bienvenido/ });
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(screen.queryByText('Administración')).not.toBeInTheDocument();
  });

  it('se puede navegar con el menú y la opción actual queda marcada', async () => {
    // La pantalla de auditoría pide su lista y sus filtros: se responden vacíos.
    installFakeApi((request) => {
      if (request.url === '/auditoria') {
        return { status: 200, data: { data: [], pagination: { page: 1, page_size: 25, total: 0, total_pages: 0 } } };
      }
      if (request.url === '/auditoria/filtros') return { status: 200, data: { data: { entity_types: [], actions: [] } } };
      return { status: 200, data: { success: true, data: ADMIN } };
    });
    mount();
    await iniciarSesion();
    await userEvent.click(await screen.findByRole('link', { name: 'Auditoría' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Auditoría' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Auditoría' })).toHaveAttribute('aria-current', 'page');
    await screen.findByText(/Todavía no hay registros/); // deja terminar la carga
  });

  it('cambiar de sucursal cambia el color de acento de toda la interfaz', async () => {
    installFakeApi(() => ({ status: 200, data: { success: true, data: ADMIN } }));
    mount();
    await iniciarSesion();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Sucursal activa' }), ESCALON.id);
    expect(document.documentElement.style.getPropertyValue('--acento')).toBe(ESCALON.theme_color);
  });

  it('"Cerrar sesión" vuelve al acceso y desaparece el menú', async () => {
    installFakeApi(() => ({ status: 200, data: { success: true, data: ADMIN } }));
    mount();
    await iniciarSesion();
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Acceso al sistema' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
