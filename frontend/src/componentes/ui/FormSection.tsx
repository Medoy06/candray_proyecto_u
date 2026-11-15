// =============================================================================
// FormSection.tsx
// Qué hace:     un grupo de campos con título, en cuadrícula de dos columnas
//               (una sola en pantallas angostas).
// Lo usan:      los formularios.
// Portado de:   Hospital Mio (components/ui/FormSection.tsx).
//
// Los formularios se arman con una lista FIJA de secciones: así el diseño no se
// reacomoda mientras la persona escribe.
// =============================================================================
import type { ReactNode } from 'react';

interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <section className="border-b border-borde py-4 first:pt-0 last:border-b-0 last:pb-0">
      <h3 className="font-titulo text-base font-semibold text-titulo">{title}</h3>
      {description !== undefined && <p className="mt-0.5 text-xs text-texto-suave">{description}</p>}
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
