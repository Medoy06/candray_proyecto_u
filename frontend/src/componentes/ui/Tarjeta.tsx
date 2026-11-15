// =============================================================================
// Tarjeta.tsx
// Qué hace:     una tarjeta blanca con borde fino y un título pequeño. Es la
//               pieza con la que se arman las páginas (Inicio, por ejemplo).
// Lo usan:      las páginas de paginas/*.
// =============================================================================
import type { ReactNode } from 'react';

interface TarjetaProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function Tarjeta({ title, children, className = '' }: TarjetaProps) {
  return (
    <section className={`rounded-lg border border-borde bg-superficie p-4 ${className}`}>
      <h2 className="mb-3 font-titulo text-base font-semibold text-titulo">{title}</h2>
      {children}
    </section>
  );
}
