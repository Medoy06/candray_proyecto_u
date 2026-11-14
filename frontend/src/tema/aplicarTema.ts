// =============================================================================
// aplicarTema.ts
// Qué hace:     applyBranchTheme(): cambia el color de acento de toda la
//               interfaz al de la sucursal activa.
// Depende de:   index.css (que declara la variable --acento).
// Lo usa:       contexto/SesionProvider.tsx cada vez que cambia la sucursal.
//
// Funciona escribiendo la variable CSS --acento en <html>: todas las clases
// bg-acento, text-acento, etc. cambian al instante, sin recargar ni recompilar.
// =============================================================================

// Color de partida (antes de entrar a una sucursal). Igual al de index.css.
export const DEFAULT_ACCENT = '#0f766e';

// Un color válido es #RRGGBB. Se comprueba aquí también porque el valor se
// escribe en una propiedad de estilo: nunca se debe escribir texto arbitrario.
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// Aplica el color de acento de una sucursal.
// Recibe: el color #RRGGBB, o null para volver al color de partida.
export function applyBranchTheme(color: string | null): void {
  const valid = color !== null && COLOR_PATTERN.test(color) ? color : DEFAULT_ACCENT;
  document.documentElement.style.setProperty('--acento', valid);
}
