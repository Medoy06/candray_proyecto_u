// =============================================================================
// panel.ts (servicio)
// Qué hace:     la llamada a la API del panel de indicadores y los tipos de sus datos.
// Depende de:   servicios/clienteApi.ts.
// Lo usan:      ganchos/usePanel.ts y paginas/panel/*.
// Requiere:     la capacidad dashboard_read (directivo y administrador).
//
// El panel solo trae NÚMEROS ya calculados por el servidor (conteos y dinero en
// dólares): no hay datos de pacientes, y el frontend no hace cuentas, solo los
// muestra.
// =============================================================================
import { api } from './clienteApi';

export interface Indicators {
  appointments_today: { scheduled: number; completed: number; no_show: number; cancelled: number };
  appointments_next_7_days: number;
  orders_open: { pending: number; in_lab: number; ready: number };
  delivered_last_30_days: number;
  sales_last_30_days: number;
}

export interface BranchIndicators extends Indicators {
  branch_id: string;
  branch_name: string;
}

export interface Panel {
  as_of: string; // el día de los números, 'AAAA-MM-DD'
  totals: Indicators;
  branches: BranchIndicators[];
}

// Los indicadores de todas las sucursales que la persona puede usar.
export async function getPanel(): Promise<Panel> {
  const response = await api.get<{ data: Panel }>('/panel');
  return response.data.data;
}
