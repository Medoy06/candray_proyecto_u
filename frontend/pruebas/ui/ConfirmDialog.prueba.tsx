// =============================================================================
// ConfirmDialog.prueba.tsx
// Qué prueba:   la ventana de confirmación: solo existe abierta, el foco inicial
//               está en "Cancelar" (la opción segura), Esc y el fondo cancelan,
//               y el modo "danger" cambia el estilo del botón de confirmar.
// =============================================================================
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../../src/componentes/ui/ConfirmDialog';

const props = { title: '¿Seguro?', message: 'Esto no se puede deshacer.', onConfirm: vi.fn(), onCancel: vi.fn() };

describe('ConfirmDialog', () => {
  it('cerrada no dibuja nada', () => {
    render(<ConfirmDialog {...props} isOpen={false} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('abierta es un alertdialog con título y mensaje enlazados', () => {
    render(<ConfirmDialog {...props} isOpen />);
    const dialog = screen.getByRole('alertdialog', { name: '¿Seguro?' });
    expect(dialog).toHaveAccessibleDescription('Esto no se puede deshacer.');
  });

  it('el foco inicial está en Cancelar, no en Confirmar', () => {
    render(<ConfirmDialog {...props} isOpen />);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('Confirmar llama a onConfirm y Cancelar a onCancel', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...props} isOpen onConfirm={onConfirm} onCancel={onCancel} confirmLabel="Eliminar" />);
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Esc y el fondo cancelan', async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...props} isOpen onCancel={onCancel} />);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByTestId('fondo-dialogo'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('danger usa el botón de peligro (borde rojo); sin danger usa el primario', () => {
    const { rerender } = render(<ConfirmDialog {...props} isOpen danger />);
    expect(screen.getByRole('button', { name: 'Confirmar' }).className).toContain('border-marca');
    rerender(<ConfirmDialog {...props} isOpen />);
    expect(screen.getByRole('button', { name: 'Confirmar' }).className).toContain('bg-marca');
  });
});
