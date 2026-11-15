// =============================================================================
// Paginacion.tsx
// Qué hace:     los controles de una lista por páginas: "Anterior", "Siguiente"
//               y el resumen "Página 2 de 7 · 163 registros".
// Lo usan:      las listas que el servidor entrega por páginas (auditoría).
//
// Es "tonto": no sabe qué se está paginando; solo avisa a qué página ir.
// `disabled` apaga los dos botones mientras se carga otra página (evita clics
// repetidos que pedirían páginas fuera de orden).
// =============================================================================
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Boton } from './Boton';

interface PaginacionProps {
  page: number;
  totalPages: number;
  total: number;
  noun: string; // plural de lo que se cuenta: "registros"
  disabled?: boolean;
  onPageChange: (page: number) => void;
}

export function Paginacion({ page, totalPages, total, noun, disabled = false, onPageChange }: PaginacionProps) {
  return (
    <nav aria-label="Paginación" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-texto-suave">
        Página {page} de {Math.max(totalPages, 1)} · {total} {noun}
      </p>
      <div className="flex gap-2">
        <Boton variant="secundario" size="sm" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="size-4" aria-hidden="true" />
          Anterior
        </Boton>
        <Boton variant="secundario" size="sm" disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Siguiente
          <ChevronRight className="size-4" aria-hidden="true" />
        </Boton>
      </div>
    </nav>
  );
}
