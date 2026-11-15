// =============================================================================
// etiquetasCitas.ts
// Qué hace:     el texto y el tono de color con que se muestra cada estado de una
//               cita.
// Depende de:   servicios/citas.ts.
// Lo usan:      paginas/citas/TablaCitas.tsx y su filtro de estado.
// =============================================================================
import type { AppointmentStatus } from '../../servicios/citas';

type Tone = 'exito' | 'aviso' | 'info' | 'neutro';

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Programada',
  completed: 'Atendida',
  cancelled: 'Cancelada',
  no_show: 'No asistió',
};

export const STATUS_TONES: Record<AppointmentStatus, Tone> = {
  scheduled: 'info',
  completed: 'exito',
  cancelled: 'neutro',
  no_show: 'aviso',
};

// El orden en que se ofrecen en el filtro.
export const STATUS_ORDER: readonly AppointmentStatus[] = ['scheduled', 'completed', 'no_show', 'cancelled'];
