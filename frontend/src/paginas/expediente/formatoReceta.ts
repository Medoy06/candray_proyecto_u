// =============================================================================
// formatoReceta.ts
// Qué hace:     cómo se escriben las medidas de una receta óptica: dioptrías con
//               signo y dos decimales, el eje en grados y la distancia en mm.
// Lo usan:      MedidasReceta.tsx.
// =============================================================================

// Esfera, cilindro y adición: "+1.50", "-2.25", "0.00". Sin dato: "—".
export function formatDiopter(value: number | null): string {
  if (value === null) return '—';
  if (value === 0) return '0.00';
  return `${value > 0 ? '+' : '-'}${Math.abs(value).toFixed(2)}`;
}

// El eje va en grados: "90°".
export function formatAxis(value: number | null): string {
  return value === null ? '—' : `${value}°`;
}

// La distancia pupilar con un decimal: "62.5 mm".
export function formatPupillaryDistance(value: number): string {
  return `${value.toFixed(1)} mm`;
}
