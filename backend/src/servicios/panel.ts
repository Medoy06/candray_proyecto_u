// =============================================================================
// panel.ts (servicio)
// Qué hace:     arma el panel de indicadores: los números de cada sucursal que
//               la persona puede usar y el total de todas ellas.
// Requerimiento: capacidad dashboard_read (indicadores sin datos de pacientes).
// Depende de:   modelos/panel.ts y utilidades/fechas.ts.
// Lo usa:       controladores/panel.ts.
//
// El servicio no recibe una sucursal elegida por el cliente: usa solo las que
// el intermediario de alcance ya comprobó (allowedBranchIds), así que nadie ve
// números de una sucursal que no le corresponde.
// =============================================================================
import { getBranchIndicators, type BranchIndicators, type Indicators } from '../modelos/panel';
import { todayInElSalvador } from '../utilidades/fechas';

export interface Panel {
  as_of: string;                 // el día al que corresponden los números ('AAAA-MM-DD')
  totals: Indicators;
  branches: BranchIndicators[];
}

// Redondea a centavos, para que sumar decimales no deje 120.00000000000001.
const toCents = (value: number): number => Math.round(value * 100) / 100;

// Suma los indicadores de varias sucursales. Con una lista vacía devuelve ceros.
export function sumIndicators(list: Indicators[]): Indicators {
  const total: Indicators = {
    appointments_today: { scheduled: 0, completed: 0, no_show: 0, cancelled: 0 },
    appointments_next_7_days: 0,
    orders_open: { pending: 0, in_lab: 0, ready: 0 },
    delivered_last_30_days: 0,
    sales_last_30_days: 0,
  };
  for (const item of list) {
    total.appointments_today.scheduled += item.appointments_today.scheduled;
    total.appointments_today.completed += item.appointments_today.completed;
    total.appointments_today.no_show += item.appointments_today.no_show;
    total.appointments_today.cancelled += item.appointments_today.cancelled;
    total.appointments_next_7_days += item.appointments_next_7_days;
    total.orders_open.pending += item.orders_open.pending;
    total.orders_open.in_lab += item.orders_open.in_lab;
    total.orders_open.ready += item.orders_open.ready;
    total.delivered_last_30_days += item.delivered_last_30_days;
    total.sales_last_30_days = toCents(total.sales_last_30_days + item.sales_last_30_days);
  }
  return total;
}

// Devuelve el panel de las sucursales indicadas.
export async function getPanel(allowedBranchIds: string[]): Promise<Panel> {
  const today = todayInElSalvador();
  const branches = await getBranchIndicators(allowedBranchIds, today);
  return { as_of: today, totals: sumIndicators(branches), branches };
}
