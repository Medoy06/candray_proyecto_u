// =============================================================================
// etiquetasOrdenes.ts
// Qué hace:     el texto y el color de cada estado de una orden de óptica, y el
//               paso siguiente que se ofrece desde cada estado.
// Depende de:   servicios/ordenesOptica.ts.
// Lo usan:      paginas/ordenes/* (la tabla, el filtro, el detalle y los avisos).
// =============================================================================
import type { OpticalOrderStatus } from '../../servicios/ordenesOptica';

type Tone = 'exito' | 'aviso' | 'info' | 'neutro';

export const STATUS_LABELS: Record<OpticalOrderStatus, string> = {
  pending: 'Pendiente',
  in_lab: 'En taller',
  ready: 'Lista',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
};

export const STATUS_TONES: Record<OpticalOrderStatus, Tone> = {
  pending: 'aviso',
  in_lab: 'info',
  ready: 'info',
  delivered: 'exito',
  cancelled: 'neutro',
};

// El orden en que se ofrecen en el filtro: el del recorrido de una orden.
export const STATUS_ORDER: readonly OpticalOrderStatus[] = ['pending', 'in_lab', 'ready', 'delivered', 'cancelled'];

// El paso que sigue desde cada estado, con el texto del botón y de la confirmación.
// Las órdenes entregadas y canceladas ya no avanzan.
export interface NextStep {
  to: 'in_lab' | 'ready' | 'delivered';
  button: string;
  confirm: string;
}

export const NEXT_STEPS: Partial<Record<OpticalOrderStatus, NextStep>> = {
  pending: {
    to: 'in_lab',
    button: 'Enviar al taller',
    confirm: 'La orden pasará a "En taller". Úselo cuando los lentes ya se mandaron a fabricar.',
  },
  in_lab: {
    to: 'ready',
    button: 'Marcar como lista',
    confirm: 'La orden pasará a "Lista". Úselo cuando los lentes ya volvieron del taller.',
  },
  ready: {
    to: 'delivered',
    button: 'Entregar al paciente',
    confirm: 'La orden pasará a "Entregada". Úselo cuando el paciente ya recibió sus lentes.',
  },
};

// ¿La orden todavía se puede cancelar? Solo mientras no esté entregada ni cancelada.
export const canCancel = (status: OpticalOrderStatus): boolean => status !== 'delivered' && status !== 'cancelled';
