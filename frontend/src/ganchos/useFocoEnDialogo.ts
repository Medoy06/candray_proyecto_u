// =============================================================================
// useFocoEnDialogo.ts
// Qué hace:     maneja el foco del teclado dentro de una ventana de diálogo:
//                 1. al abrirse, el foco pasa al diálogo (al primer elemento con
//                    data-autofocus o, si no hay, al primero que se pueda enfocar);
//                 2. Tab y Mayús+Tab dan la vuelta DENTRO del diálogo (no se
//                    escapan a la página de atrás);
//                 3. al cerrarse, el foco vuelve al elemento que lo abrió.
// Lo usan:      componentes/ui/ModalShell.tsx y componentes/ui/ConfirmDialog.tsx.
//
// Sin esto, quien navega con teclado o lector de pantalla se perdería detrás
// del diálogo. Es parte del nivel de accesibilidad AA que busca el diseño.
// =============================================================================
import { useEffect, type RefObject } from 'react';

// Elementos a los que se puede llegar con Tab.
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useFocoEnDialogo(dialogRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    const opener = document.activeElement as HTMLElement | null; // quien abrió el diálogo
    const focusables = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => !element.hasAttribute('disabled'));

    (dialog.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      opener?.focus?.();
    };
  }, [dialogRef]);
}
