// =============================================================================
// etiquetasOrdenes.prueba.ts
// Qué prueba:   los textos, colores y pasos de los estados de una orden de
//               óptica: que todos tengan etiqueta, que el recorrido sea el
//               correcto y que las órdenes cerradas no ofrezcan más pasos.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { NEXT_STEPS, STATUS_LABELS, STATUS_ORDER, STATUS_TONES, canCancel } from '../../src/paginas/ordenes/etiquetasOrdenes';

describe('estados de una orden', () => {
  it('cada estado tiene texto y color, y el filtro los ofrece en el orden del recorrido', () => {
    expect(STATUS_ORDER).toEqual(['pending', 'in_lab', 'ready', 'delivered', 'cancelled']);
    expect(STATUS_ORDER.map((status) => STATUS_LABELS[status])).toEqual(['Pendiente', 'En taller', 'Lista', 'Entregada', 'Cancelada']);
    expect(STATUS_TONES).toEqual({ pending: 'aviso', in_lab: 'info', ready: 'info', delivered: 'exito', cancelled: 'neutro' });
  });

  it('desde cada estado se ofrece el paso siguiente del recorrido', () => {
    expect(NEXT_STEPS.pending).toMatchObject({ to: 'in_lab', button: 'Enviar al taller' });
    expect(NEXT_STEPS.in_lab).toMatchObject({ to: 'ready', button: 'Marcar como lista' });
    expect(NEXT_STEPS.ready).toMatchObject({ to: 'delivered', button: 'Entregar al paciente' });
  });

  it('una orden entregada o cancelada ya no avanza ni se cancela', () => {
    expect(NEXT_STEPS.delivered).toBeUndefined();
    expect(NEXT_STEPS.cancelled).toBeUndefined();
    expect(canCancel('delivered')).toBe(false);
    expect(canCancel('cancelled')).toBe(false);
  });

  it.each(['pending', 'in_lab', 'ready'] as const)('una orden %s todavía se puede cancelar', (status) => {
    expect(canCancel(status)).toBe(true);
  });
});
