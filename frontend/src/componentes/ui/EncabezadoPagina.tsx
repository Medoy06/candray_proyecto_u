// =============================================================================
// EncabezadoPagina.tsx
// Qué hace:     el título de una página (y una línea de descripción opcional).
//               Todas las páginas lo usan, para que se vean iguales.
// Lo usan:      las páginas de paginas/*.
// =============================================================================
interface EncabezadoPaginaProps {
  title: string;
  description?: string;
}

export function EncabezadoPagina({ title, description }: EncabezadoPaginaProps) {
  return (
    <div className="mb-5">
      <h1 className="font-titulo text-2xl font-semibold text-titulo">{title}</h1>
      {description !== undefined && <p className="mt-1 text-sm text-texto-suave">{description}</p>}
    </div>
  );
}
