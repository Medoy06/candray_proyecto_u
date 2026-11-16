// =============================================================================
// BloqueIndicadores.tsx
// Qué hace:     dibuja los números de un conjunto de indicadores (una sucursal o
//               el total): citas de hoy, próximas citas, órdenes abiertas y
//               ventas de los últimos 30 días.
// Depende de:   servicios/panel.ts y utilidades/formatoMoneda.ts.
// Lo usa:       paginas/panel/PaginaPanel.tsx.
//
// Solo muestra lo que recibe; no suma ni calcula nada.
// =============================================================================
import type { ReactNode } from 'react';
import type { Indicators } from '../../servicios/panel';
import { formatMoney } from '../../utilidades/formatoMoneda';

// Un grupo de cifras con su título.
function Grupo({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-medium text-titulo">{title}</h3>
      <dl className="space-y-0.5 text-sm">{children}</dl>
    </div>
  );
}

// Una cifra: su nombre a la izquierda y el valor a la derecha.
function Cifra({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-texto-suave">{label}</dt>
      <dd className="font-medium tabular-nums text-texto">{value}</dd>
    </div>
  );
}

export function BloqueIndicadores({ indicators }: { indicators: Indicators }) {
  const { appointments_today: today, orders_open: open } = indicators;
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <Grupo title="Citas de hoy">
        <Cifra label="Agendadas" value={today.scheduled} />
        <Cifra label="Atendidas" value={today.completed} />
        <Cifra label="Ausentes" value={today.no_show} />
        <Cifra label="Canceladas" value={today.cancelled} />
      </Grupo>
      <Grupo title="Próximos 7 días">
        <Cifra label="Citas agendadas" value={indicators.appointments_next_7_days} />
      </Grupo>
      <Grupo title="Órdenes de óptica abiertas">
        <Cifra label="Pendientes" value={open.pending} />
        <Cifra label="En taller" value={open.in_lab} />
        <Cifra label="Listas" value={open.ready} />
      </Grupo>
      <Grupo title="Entregadas en 30 días">
        <Cifra label="Órdenes" value={indicators.delivered_last_30_days} />
        <Cifra label="Ventas (IVA incluido)" value={formatMoney(indicators.sales_last_30_days)} />
      </Grupo>
    </div>
  );
}
