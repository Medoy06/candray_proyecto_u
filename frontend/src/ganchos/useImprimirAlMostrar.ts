// =============================================================================
// useImprimirAlMostrar.ts
// Qué hace:     cuando hay un documento listo para imprimir (ya dibujado en la
//               página, oculto en pantalla), abre el diálogo de impresión del
//               navegador y, al cerrarse, avisa para que se descarte.
// Lo usa:       paginas/expediente/PaginaExpediente.tsx (el expediente y la receta).
//
// "document" es lo que se va a imprimir: null = no hay nada. Si llega un
// documento distinto, se vuelve a imprimir.
// =============================================================================
import { useEffect, useRef } from 'react';

export function useImprimirAlMostrar(document: unknown, onAfterPrint: () => void): void {
  // Siempre la versión más reciente de la función, sin volver a disparar la impresión.
  const afterPrint = useRef(onAfterPrint);
  afterPrint.current = onAfterPrint;

  useEffect(() => {
    if (document === null) return;
    const clear = () => afterPrint.current();
    window.addEventListener('afterprint', clear, { once: true });
    window.print();
    return () => window.removeEventListener('afterprint', clear);
  }, [document]);
}
