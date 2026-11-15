// =============================================================================
// MarcaCandray.tsx
// Qué hace:     la marca de Candray (nombre y lema) que aparece en el encabezado
//               y en la pantalla de acceso.
// Lo usan:      componentes/estructura/EncabezadoApp.tsx y PaginaInicioSesion.tsx.
//
// POR AHORA ES SOLO TEXTO. El logo oficial (el emblema rojo) es propiedad de
// Candray y queda pendiente. Está en UN solo componente a propósito: cuando se
// tenga el archivo, solo se cambia este archivo y toda la aplicación se actualiza.
// =============================================================================
interface MarcaCandrayProps {
  large?: boolean; // versión grande, centrada (pantalla de acceso)
}

export function MarcaCandray({ large = false }: MarcaCandrayProps) {
  return (
    <div className={large ? 'text-center' : ''}>
      <p
        className={`font-titulo font-semibold uppercase leading-none tracking-[0.12em] text-titulo ${
          large ? 'text-3xl' : 'text-lg'
        }`}
      >
        Candray
      </p>
      <p className={`leading-tight text-texto-suave ${large ? 'mt-2 text-sm' : 'mt-1 text-xs'}`}>
        Clínicas y Ópticas
      </p>
    </div>
  );
}
