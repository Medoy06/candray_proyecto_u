// =============================================================================
// Paginacion.prueba.tsx
// Qué prueba:   el resumen de página y los botones Anterior/Siguiente: cuándo se
//               apagan (primera y última página, o mientras carga) y a qué
//               página avisan.
// =============================================================================
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Paginacion } from '../../src/componentes/ui/Paginacion';

function mount(props: Partial<Parameters<typeof Paginacion>[0]> = {}) {
  const onPageChange = vi.fn();
  render(<Paginacion page={2} totalPages={3} total={60} noun="registros" onPageChange={onPageChange} {...props} />);
  return onPageChange;
}

describe('Paginacion', () => {
  it('resume la página y el total, y tiene nombre accesible', () => {
    mount();
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toHaveTextContent('Página 2 de 3 · 60 registros');
  });

  it('en una página intermedia ambos botones avisan la página vecina', async () => {
    const onPageChange = mount();
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
  });

  it('en la primera página "Anterior" está apagado', () => {
    mount({ page: 1 });
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  it('en la última página "Siguiente" está apagado', () => {
    mount({ page: 3 });
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled();
  });

  it('con una sola página los dos están apagados', () => {
    mount({ page: 1, totalPages: 1, total: 4 });
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('con disabled ambos se apagan aunque haya más páginas', () => {
    mount({ disabled: true });
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('sin páginas (0) muestra "de 1" y no queda en "de 0"', () => {
    mount({ page: 1, totalPages: 0, total: 0 });
    expect(screen.getByRole('navigation')).toHaveTextContent('Página 1 de 1 · 0 registros');
  });
});
