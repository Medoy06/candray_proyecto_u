// =============================================================================
// EncabezadoApp.prueba.tsx
// Qué prueba:   la barra superior: quién tiene la sesión, el selector de
//               sucursal (una sola o varias), el cierre de sesión y la franja
//               de color.
// =============================================================================
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EncabezadoApp } from '../../src/componentes/estructura/EncabezadoApp';
import { renderConSesion } from '../ayudas/conSesion';
import { CENTRAL, ESCALON } from '../ayudas/datosSesion';

describe('EncabezadoApp', () => {
  it('muestra el nombre y el rol de quien tiene la sesión', () => {
    renderConSesion(<EncabezadoApp />, { role: 'recepcionista' });
    expect(screen.getByText('Alejandro Mejía')).toBeInTheDocument();
    expect(screen.getByText('Recepción')).toBeInTheDocument();
  });

  it('muestra la marca de Candray', () => {
    renderConSesion(<EncabezadoApp />);
    expect(screen.getByText('Candray')).toBeInTheDocument();
    expect(screen.getByText('Clínicas y Ópticas')).toBeInTheDocument();
  });

  it('el botón "Cerrar sesión" cierra la sesión', async () => {
    const { logout } = renderConSesion(<EncabezadoApp />);
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(logout).toHaveBeenCalledOnce();
  });

  it('tiene la franja con el color de la sucursal', () => {
    renderConSesion(<EncabezadoApp />);
    expect(screen.getByTestId('franja-sucursal')).toHaveClass('bg-acento');
  });
});

describe('SelectorSucursal (dentro del encabezado)', () => {
  it('con varias sucursales ofrece una lista con la activa seleccionada', () => {
    renderConSesion(<EncabezadoApp />, { branches: [CENTRAL, ESCALON], activeBranch: ESCALON });
    const select = screen.getByRole('combobox', { name: 'Sucursal activa' });
    expect(select).toHaveValue(ESCALON.id);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Candray Central',
      'Candray Escalón',
    ]);
  });

  it('elegir otra sucursal avisa a la sesión con el id elegido', async () => {
    const { selectBranch } = renderConSesion(<EncabezadoApp />, { branches: [CENTRAL, ESCALON] });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sucursal activa' }), ESCALON.id);
    expect(selectBranch).toHaveBeenCalledWith(ESCALON.id);
  });

  it('con una sola sucursal solo muestra su nombre, sin lista', () => {
    renderConSesion(<EncabezadoApp />, { branches: [CENTRAL] });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Candray Central')).toBeInTheDocument();
  });
});
