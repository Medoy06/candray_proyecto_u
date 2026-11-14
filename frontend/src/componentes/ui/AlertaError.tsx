// =============================================================================
// AlertaError.tsx
// Qué hace:     un cuadro rojo con un mensaje de error. role="alert" hace que el
//               lector de pantalla lo anuncie apenas aparece.
// Lo usan:      cualquier formulario o página que muestre errores de la API.
// =============================================================================
export function AlertaError({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}
