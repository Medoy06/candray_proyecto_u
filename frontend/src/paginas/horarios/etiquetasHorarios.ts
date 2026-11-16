// =============================================================================
// etiquetasHorarios.ts
// Qué hace:     el nombre de cada día de la semana, tal como lo guarda la API
//               (1 = lunes ... 7 = domingo).
// Lo usan:      paginas/horarios/* (la tabla y el formulario).
// =============================================================================
export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

// Los días en orden, para armar la lista del formulario.
export const WEEKDAYS: number[] = [1, 2, 3, 4, 5, 6, 7];
