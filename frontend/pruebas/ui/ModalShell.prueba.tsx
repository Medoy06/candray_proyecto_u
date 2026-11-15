// =============================================================================
// ModalShell.prueba.tsx
// Qué prueba:   la ventana de formulario: roles de accesibilidad, cierre con Esc,
//               con la X y con el fondo, el error siempre visible y el manejo
//               del foco (foco inicial, Tab atrapado, foco devuelto al cerrar).
// =============================================================================
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ModalShell } from '../../src/componentes/ui/ModalShell';

function Ejemplo({ closeOnBackdrop = true, error }: { closeOnBackdrop?: boolean; error?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      {open && (
        <ModalShell
          title="Mi ventana"
          onClose={() => setOpen(false)}
          closeOnBackdrop={closeOnBackdrop}
          error={error}
          footer={<button>Guardar</button>}
        >
          <input aria-label="Primero" data-autofocus />
          <input aria-label="Segundo" />
        </ModalShell>
      )}
    </>
  );
}

describe('ModalShell', () => {
  it('es un diálogo modal con su título como nombre accesible', () => {
    render(<ModalShell title="Nuevo" onClose={vi.fn()} footer={null}>cuerpo</ModalShell>);
    const dialog = screen.getByRole('dialog', { name: 'Nuevo' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('Esc llama a onClose', async () => {
    const onClose = vi.fn();
    render(<ModalShell title="x" onClose={onClose} footer={null}>c</ModalShell>);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('la X cierra', async () => {
    const onClose = vi.fn();
    render(<ModalShell title="x" onClose={onClose} footer={null}>c</ModalShell>);
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('el fondo cierra por defecto, pero no con closeOnBackdrop={false}', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<ModalShell title="x" onClose={onClose} footer={null}>c</ModalShell>);
    await userEvent.click(screen.getByTestId('fondo-dialogo'));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<ModalShell title="x" onClose={onClose} closeOnBackdrop={false} footer={null}>c</ModalShell>);
    await userEvent.click(screen.getByTestId('fondo-dialogo'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('muestra el error con su icono y texto sobre los botones', () => {
    render(<ModalShell title="x" onClose={vi.fn()} error="Algo falló" footer={<button>Ok</button>}>c</ModalShell>);
    expect(screen.getByRole('alert')).toHaveTextContent('Algo falló');
  });

  it('sin error no muestra ninguna alerta', () => {
    render(<ModalShell title="x" onClose={vi.fn()} footer={null}>c</ModalShell>);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('el foco inicial va al campo marcado con data-autofocus', async () => {
    render(<Ejemplo />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByLabelText('Primero')).toHaveFocus();
  });

  it('Tab no se escapa de la ventana: da la vuelta', async () => {
    render(<Ejemplo />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    // Foco: Primero -> Segundo -> Guardar -> (vuelta) la X -> Primero...
    await userEvent.tab();
    expect(screen.getByLabelText('Segundo')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
  });

  it('Shift+Tab desde el primer elemento salta al último', async () => {
    render(<Ejemplo />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await userEvent.tab({ shift: true }); // Primero -> la X
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
    await userEvent.tab({ shift: true }); // la X es el primero: salta al último
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus();
  });

  it('al cerrar, el foco vuelve al botón que la abrió', async () => {
    render(<Ejemplo />);
    const opener = screen.getByRole('button', { name: 'Abrir' });
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
