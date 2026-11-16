// =============================================================================
// Estructura.prueba.tsx
// Qué prueba:   que al imprimir solo salga el contenido de la página: el
//               encabezado y el menú lateral se marcan para ocultarse en papel
//               (print:hidden) y el contenido no queda recortado.
// Cómo:         dibuja el marco real dentro de una sesión de prueba.
// =============================================================================
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Estructura } from '../../src/componentes/estructura/Estructura';
import { renderConSesion } from '../ayudas/conSesion';

function mount() {
  return renderConSesion(
    <Routes>
      <Route element={<Estructura />}>
        <Route path="/" element={<p>Contenido</p>} />
      </Route>
    </Routes>,
  );
}

describe('Estructura al imprimir', () => {
  it('el encabezado y el menú se ocultan en papel', () => {
    mount();
    expect(screen.getByRole('banner').parentElement).toHaveClass('print:hidden');
    expect(screen.getByRole('navigation', { name: 'Navegación principal' }).closest('div.flex')).toHaveClass('print:hidden');
  });

  it('el contenido no queda recortado ni con márgenes de pantalla', () => {
    mount();
    expect(screen.getByRole('main')).toHaveClass('print:overflow-visible', 'print:p-0');
  });
});
