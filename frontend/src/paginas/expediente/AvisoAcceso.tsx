// =============================================================================
// AvisoAcceso.tsx
// Qué hace:     explica POR QUÉ se está viendo este expediente cuando no es por
//               atender al paciente: por una interconsulta (con su vencimiento)
//               o por ser administrador. En ambos casos es solo lectura.
// Depende de:   servicios/expedientes.ts y utilidades/formatoFecha.ts.
// Lo usa:       paginas/expediente/PaginaExpediente.tsx.
//
// Si la persona atiende al paciente (acceso por cita) no se muestra nada.
// =============================================================================
import { Info } from 'lucide-react';
import type { RecordAccess } from '../../servicios/expedientes';
import { formatDateTime } from '../../utilidades/formatoFecha';

export function AvisoAcceso({ access }: { access: RecordAccess }) {
  if (access.reason === 'appointment') return null;

  const text =
    access.reason === 'referral'
      ? `Acceso por interconsulta, solo lectura, hasta el ${formatDateTime(access.expiresAt)}.`
      : 'Vista de administración, solo lectura: las notas las escribe el médico que atiende.';

  return (
    <p
      role="status"
      className="mb-4 flex items-start gap-2 rounded-md border border-borde bg-info-fondo px-3 py-2.5 text-sm text-info-texto"
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}
