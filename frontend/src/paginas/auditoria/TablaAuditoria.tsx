// =============================================================================
// TablaAuditoria.tsx
// Qué hace:     la tabla de la bitácora: cuándo, quién, qué acción, sobre qué,
//               en qué sucursal y el detalle de lo que cambió.
// Depende de:   componentes/ui/Tabla.tsx, utilidades/formatoFecha.ts y
//               etiquetasAuditoria.ts.
// Lo usa:       paginas/auditoria/PaginaAuditoria.tsx.
//
// Solo muestra: la bitácora no se edita ni se borra desde la pantalla.
// =============================================================================
import { Tabla, type TablaColumna } from '../../componentes/ui/Tabla';
import type { AuditEntry } from '../../servicios/auditoria';
import { formatDateTime } from '../../utilidades/formatoFecha';
import { actionLabel, entityLabel, summarizeDetail } from './etiquetasAuditoria';

const COLUMNS: TablaColumna<AuditEntry>[] = [
  {
    id: 'cuando',
    header: 'Fecha y hora',
    noWrap: true,
    cell: (entry) => formatDateTime(entry.created_at),
  },
  {
    id: 'quien',
    header: 'Quién',
    cell: (entry) =>
      entry.actor_name === null ? (
        // Sin usuario: por ejemplo, un intento de acceso con un correo que no existe.
        <span className="text-texto-suave">Sin usuario</span>
      ) : (
        <>
          <span className="block font-medium text-texto">{entry.actor_name}</span>
          {entry.actor_email !== null && <span className="block text-xs text-texto-suave">{entry.actor_email}</span>}
        </>
      ),
  },
  { id: 'accion', header: 'Acción', cell: (entry) => actionLabel(entry.action) },
  { id: 'tipo', header: 'Tipo', cell: (entry) => entityLabel(entry.entity_type) },
  { id: 'sucursal', header: 'Sucursal', cell: (entry) => entry.branch_name ?? '—' },
  {
    id: 'detalle',
    header: 'Detalle',
    cell: (entry) => {
      const lines = summarizeDetail(entry.detail);
      if (lines.length === 0) return <span className="text-texto-suave">—</span>;
      return (
        <ul className="space-y-0.5 text-xs text-texto-suave">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      );
    },
  },
];

export function TablaAuditoria({ entries }: { entries: AuditEntry[] }) {
  return <Tabla label="Bitácora de auditoría" columns={COLUMNS} rows={entries} rowKey={(entry) => entry.id} />;
}
