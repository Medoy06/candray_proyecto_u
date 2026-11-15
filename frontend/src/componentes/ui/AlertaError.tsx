// =============================================================================
// AlertaError.tsx
// Qué hace:     un cuadro con un mensaje de error. role="alert" hace que el
//               lector de pantalla lo anuncie apenas aparece.
// Lo usan:      cualquier formulario o página que muestre errores de la API.
//
// El rojo es también el color de la marca, así que el error NO depende del
// color: siempre lleva icono y texto, sobre un fondo rosado claro.
// =============================================================================
import { CircleAlert } from 'lucide-react';

export function AlertaError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-error-borde bg-error-fondo px-3 py-2.5 text-sm text-error-texto"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
