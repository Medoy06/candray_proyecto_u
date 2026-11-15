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
import { renderConSesion } from '../ayudas/conSesion';

describe('RutasAplicacion', () => {
  it('"/" muestra el Inicio dentro del marco (encabezado, menú y contenido)', () => {
    renderConSesion(<RutasAplicacion />, { route: '/' });
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Bienvenido');
  });

  it('con la capacidad, la pantalla se abre', () => {
    renderConSesion(<RutasAplicacion />, { route: '/usuarios', capabilities: ['users_manage'] });
    expect(screen.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeInTheDocument();
    expect(screen.getByText('En construcción')).toBeInTheDocument();
  });

  it.each(['/usuarios', '/sucursales', '/auditoria'])(
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
