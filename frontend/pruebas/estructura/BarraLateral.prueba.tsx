// =============================================================================
// BarraLateral.prueba.tsx
// Qué prueba:   el menú lateral: muestra solo lo permitido, marca la pantalla
//               actual y se colapsa según el ancho de la ventana (regla D24).
// Cómo:         dibuja el menú dentro de una sesión falsa (ayudas/conSesion.tsx).
// =============================================================================
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BarraLateral } from '../../src/componentes/estructura/BarraLateral';
import { renderConSesion } from '../ayudas/conSesion';
import { activeResizeListeners, installFakeWindow, resizeWindow } from '../ayudas/ventana';

const menu = () => screen.getByRole('navigation', { name: 'Navegación principal' });
const linkNames = () => within(menu()).getAllByRole('link').map((link) => link.textContent);

describe('BarraLateral: qué muestra', () => {
  it('sin capacidades, solo el Inicio y sin encabezados de sección vacíos', () => {
    renderConSesion(<BarraLateral />, { capabilities: [] });
    expect(linkNames()).toEqual(['Inicio']);
    expect(screen.queryByText('Administración')).not.toBeInTheDocument();
  });

  it('con capacidades de administración, muestra su sección y sus pantallas', () => {
    renderConSesion(<BarraLateral />, { capabilities: ['users_manage', 'branches_manage', 'audit_read'] });
    expect(linkNames()).toEqual(['Inicio', 'Usuarios', 'Sucursales', 'Auditoría']);
    expect(screen.getByText('Administración')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
  });

  it('solo muestra la pantalla de la capacidad que se tiene', () => {
    renderConSesion(<BarraLateral />, { capabilities: ['audit_read'] });
    expect(linkNames()).toEqual(['Inicio', 'Auditoría']);
  });

  it('cada opción apunta a su dirección', () => {
    renderConSesion(<BarraLateral />, { capabilities: ['users_manage'] });
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/usuarios');
    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
  });
});

describe('BarraLateral: pantalla actual', () => {
  it('en "/" solo el Inicio está marcado como actual', () => {
    renderConSesion(<BarraLateral />, { capabilities: ['users_manage'], route: '/' });
    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Usuarios' })).not.toHaveAttribute('aria-current');
  });

  it('en "/usuarios" el Inicio deja de estar marcado y Usuarios sí', () => {
    renderConSesion(<BarraLateral />, { capabilities: ['users_manage'], route: '/usuarios' });
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
  });
});

describe('BarraLateral: colapso (ventana angosta)', () => {
  const toggle = () => screen.getByRole('button', { name: /(contraer|expandir) menú/i });

  it('en ventana ancha arranca expandido, con los encabezados de sección', () => {
    renderConSesion(<BarraLateral />, { capabilities: ['users_manage'] });
    expect(toggle()).toHaveAccessibleName('Contraer menú');
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Administración')).toBeInTheDocument();
  });

  it('en ventana angosta arranca colapsado: sin encabezados, pero con nombres accesibles', () => {
    installFakeWindow(true);
    renderConSesion(<BarraLateral />, { capabilities: ['users_manage'] });
    expect(toggle()).toHaveAccessibleName('Expandir menú');
    expect(screen.queryByText('Administración')).not.toBeInTheDocument();
    // Sin texto a la vista, cada opción conserva su nombre para el lector de pantalla.
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('title', 'Usuarios');
  });

  it('colapsado, una línea separa las secciones (y no hay una antes de la primera)', () => {
    installFakeWindow(true);
    const { container } = renderConSesion(<BarraLateral />, { capabilities: ['users_manage'] });
    // Dos secciones (General y Administración) => un solo separador, entre ellas.
    expect(container.querySelectorAll('nav [aria-hidden="true"].border-t')).toHaveLength(1);
  });

  it('el botón alterna entre colapsado y expandido', async () => {
    renderConSesion(<BarraLateral />, { capabilities: ['users_manage'] });
    await userEvent.click(toggle());
    expect(toggle()).toHaveAccessibleName('Expandir menú');
    expect(screen.queryByText('Administración')).not.toBeInTheDocument();
    await userEvent.click(toggle());
    expect(toggle()).toHaveAccessibleName('Contraer menú');
    expect(screen.getByText('Administración')).toBeInTheDocument();
  });

  it('al achicar la ventana el menú se colapsa solo, y al agrandarla se expande', () => {
    renderConSesion(<BarraLateral />, { capabilities: ['users_manage'] });
    resizeWindow(true);
    expect(toggle()).toHaveAccessibleName('Expandir menú');
    resizeWindow(false);
    expect(toggle()).toHaveAccessibleName('Contraer menú');
  });

  it('cruzar el límite de la ventana pasa por encima de lo que se eligió a mano', async () => {
    renderConSesion(<BarraLateral />, { capabilities: ['users_manage'] });
    await userEvent.click(toggle()); // a mano: colapsado
    expect(toggle()).toHaveAccessibleName('Expandir menú');
    resizeWindow(true); // la ventana se hace angosta...
    resizeWindow(false); // ...y vuelve a ser ancha: manda la ventana
    expect(toggle()).toHaveAccessibleName('Contraer menú');
  });

  it('al desmontarse deja de escuchar el tamaño de la ventana', () => {
    const { unmount } = renderConSesion(<BarraLateral />);
    expect(activeResizeListeners()).toBe(1);
    unmount();
    expect(activeResizeListeners()).toBe(0);
  });
});
