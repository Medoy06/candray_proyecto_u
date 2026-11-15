// =============================================================================
// AlertaExito.tsx
// Qué hace:     un cuadro verde que confirma que una acción salió bien
//               ("Usuario creado."). role="status" hace que el lector de
//               pantalla lo anuncie sin interrumpir. Se puede cerrar.
// Lo usan:      las páginas, después de guardar.
// =============================================================================
import { CircleCheck, X } from 'lucide-react';

interface AlertaExitoProps {
  message: string;
  onClose?: () => void;
}

export function AlertaExito({ message, onClose }: AlertaExitoProps) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-exito-texto/30 bg-exito-fondo px-3 py-2.5 text-sm text-exito-texto"
    >
      <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      {onClose !== undefined && (
        <button type="button" onClick={onClose} aria-label="Cerrar aviso" className="rounded-sm p-0.5 hover:bg-exito-texto/10">
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
