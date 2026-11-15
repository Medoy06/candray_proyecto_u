// =============================================================================
// ConfirmDialog.tsx
// Qué hace:     una ventana pequeña que pide confirmar una acción antes de
//               hacerla ("¿Desactivar a X?"), con botones Cancelar y Confirmar.
// Depende de:   ganchos/useFocoEnDialogo.ts y componentes/ui/Boton.tsx.
// Lo usan:      las páginas, para acciones que no se deben hacer por error.
// Portado de:   Hospital Mio (components/ui/ConfirmDialog.tsx), con el estilo de
//               Candray y manejo de foco para teclado.
//
// danger: la acción es destructiva. El botón de confirmar va con borde rojo y
// sin relleno (no se confunde con la acción principal) y el foco inicial queda
// en "Cancelar", para que Enter por descuido no confirme.
// Esc o un clic fuera de la ventana equivalen a Cancelar.
// =============================================================================
import { useEffect, useId, useRef } from 'react';
import { useFocoEnDialogo } from '../../ganchos/useFocoEnDialogo';
import { Boton } from './Boton';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

// La ventana abierta va en un componente aparte para que los ganchos (foco, Esc)
// solo existan mientras está abierta.
function OpenDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  danger = false,
}: Omit<ConfirmDialogProps, 'isOpen'>) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocoEnDialogo(dialogRef);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-titulo/40" data-testid="fondo-dialogo" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-lg border border-borde bg-superficie p-6 shadow-lg focus:outline-none"
      >
        <h2 id={titleId} className="mb-2 font-titulo text-xl font-semibold text-titulo">
          {title}
        </h2>
        <p id={messageId} className="mb-6 text-sm text-texto-suave">
          {message}
        </p>
        <div className="flex justify-end gap-3">
          {/* Foco inicial en Cancelar: lo más seguro si alguien pulsa Enter sin mirar. */}
          <Boton data-autofocus onClick={onCancel}>
            {cancelLabel}
          </Boton>
          <Boton variant={danger ? 'peligro' : 'primario'} onClick={onConfirm}>
            {confirmLabel}
          </Boton>
        </div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ isOpen, ...rest }: ConfirmDialogProps) {
  return isOpen ? <OpenDialog {...rest} /> : null;
}
