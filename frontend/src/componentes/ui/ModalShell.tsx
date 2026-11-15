// =============================================================================
// ModalShell.tsx
// Qué hace:     el marco de toda ventana de formulario (diálogo): título, cuerpo
//               con desplazamiento, pie con botones fijos y un lugar para el
//               error, siempre a la vista.
// Depende de:   ganchos/useFocoEnDialogo.ts y componentes/ui/AlertaError.tsx.
// Lo usan:      los formularios en ventana (crear y editar usuarios, etc.).
// Portado de:   Hospital Mio (components/ui/ModalShell.tsx), con el estilo de
//               Candray y manejo de foco para teclado.
//
// Reglas de estabilidad (heredadas):
//   - anclado arriba: si el contenido crece, crece hacia abajo y el título no salta;
//   - encabezado y pie fijos: solo el cuerpo se desplaza;
//   - Esc lo cierra.
// closeOnBackdrop={false} en formularios: un clic perdido fuera de la ventana no
// debe borrar lo que la persona ya escribió.
//
// Regla de uso: NO abrir un ConfirmDialog desde dentro de un ModalShell (los dos
// escuchan Esc y se cerrarían a la vez). Las confirmaciones se abren desde la página.
// =============================================================================
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useFocoEnDialogo } from '../../ganchos/useFocoEnDialogo';
import { AlertaError } from './AlertaError';

const SIZES = { lg: 'max-w-lg', '2xl': 'max-w-2xl' } as const;

interface ModalShellProps {
  title: string;
  badge?: ReactNode;          // etiqueta pequeña junto al título
  onClose: () => void;
  children: ReactNode;        // cuerpo (con desplazamiento)
  footer: ReactNode;          // botones de acción, fijos abajo
  error?: string;             // se muestra sobre los botones, siempre a la vista
  size?: keyof typeof SIZES;
  closeOnBackdrop?: boolean;
}

export function ModalShell({
  title,
  badge,
  onClose,
  children,
  footer,
  error,
  size = 'lg',
  closeOnBackdrop = true,
}: ModalShellProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocoEnDialogo(dialogRef);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[6vh]">
      <div
        className="absolute inset-0 bg-titulo/40"
        data-testid="fondo-dialogo"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[88vh] w-full flex-col rounded-lg border border-borde bg-superficie shadow-lg focus:outline-none ${SIZES[size]}`}
      >
        <div className="flex items-center gap-3 border-b border-borde px-6 pb-3 pt-5">
          <h2 id={titleId} className="font-titulo text-xl font-semibold text-titulo">
            {title}
          </h2>
          {badge}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="ml-auto rounded-md p-1 text-texto-suave transition-colors hover:bg-apoyo hover:text-titulo"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4">{children}</div>
        <div className="border-t border-borde px-6 py-4">
          {error !== undefined && error !== '' && (
            <div className="mb-3">
              <AlertaError message={error} />
            </div>
          )}
          <div className="flex justify-end gap-3">{footer}</div>
        </div>
      </div>
    </div>
  );
}
