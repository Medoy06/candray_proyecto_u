// =============================================================================
// PaginaInicio.prueba.tsx
// Qué prueba:   la pantalla de inicio: saluda con los datos de la sesión,
//               muestra los de la sucursal activa (con el formato de El
//               Salvador) y lista solo las secciones que el rol puede abrir.
// =============================================================================
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PaginaInicio } from '../../src/paginas/inicio/PaginaInicio';
import { renderConSesion } from '../ayudas/conSesion';
import { CENTRAL } from '../ayudas/datosSesion';

describe('PaginaInicio', () => {
  it('saluda con el nombre y muestra el rol y la sucursal', () => {
    renderConSesion(<PaginaInicio />, { role: 'recepcionista' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bienvenido, Alejandro Mejía');
    expect(screen.getByText('Recepción · Candray Central')).toBeInTheDocument();
    expect(screen.getByText('dr.mejia@candray.test')).toBeInTheDocument();
  });

  it('muestra los datos de la sucursal con el horario en 24 horas', () => {
    renderConSesion(<PaginaInicio />, {
      activeBranch: { ...CENTRAL, address: '1a Av. Norte, San Salvador', phone: '2233-6500' },
      branches: [{ ...CENTRAL, address: '1a Av. Norte, San Salvador', phone: '2233-6500' }],
    });
    expect(screen.getByText('1a Av. Norte, San Salvador')).toBeInTheDocument();
    expect(screen.getByText('2233-6500')).toBeInTheDocument();
    expect(screen.getByText('08:00 a 17:00')).toBeInTheDocument();
    expect(screen.getByText('Mostrador de óptica: sí')).toBeInTheDocument();
  });

  it('si la sucursal no tiene dirección o teléfono, lo dice en vez de dejar un hueco', () => {
    renderConSesion(<PaginaInicio />, { activeBranch: { ...CENTRAL, address: null, phone: null } });
    expect(screen.getByText('Sin dirección registrada')).toBeInTheDocument();
    expect(screen.getByText('Sin teléfono registrado')).toBeInTheDocument();
  });

  it('una sucursal sin mostrador de óptica lo indica', () => {
    renderConSesion(<PaginaInicio />, { activeBranch: { ...CENTRAL, has_optical_counter: false } });
    expect(screen.getByText('Mostrador de óptica: no')).toBeInTheDocument();
  });

  it('lista como enlaces solo las secciones permitidas (sin repetir el Inicio)', () => {
    renderConSesion(<PaginaInicio />, { capabilities: ['users_manage', 'audit_read'] });
    const tarjeta = screen.getByRole('heading', { name: /Secciones disponibles/ }).closest('section')!;
    const links = within(tarjeta).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/usuarios', '/auditoria']);
  });

  it('sin secciones disponibles lo explica en lugar de mostrar una lista vacía', () => {
    renderConSesion(<PaginaInicio />, { capabilities: [] });
    expect(screen.getByText(/Por ahora no hay secciones disponibles para su rol/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
