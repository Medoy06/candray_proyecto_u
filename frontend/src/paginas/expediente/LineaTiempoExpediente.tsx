// =============================================================================
// LineaTiempoExpediente.tsx
// Qué hace:     la lista de entradas del expediente, de la más reciente a la
//               más antigua. A cada enmienda le busca la fecha de la nota que
//               corrige (si esa nota está en la misma página).
// Depende de:   paginas/expediente/EntradaExpediente.tsx y servicios/expedientes.ts.
// Lo usa:       paginas/expediente/PaginaExpediente.tsx.
// =============================================================================
import type { RecordEntry } from '../../servicios/expedientes';
import { EntradaExpediente } from './EntradaExpediente';

interface LineaTiempoExpedienteProps {
  entries: RecordEntry[];
  canAmend: boolean;
  onAmend: (entry: RecordEntry) => void;
  // En qué notas se ofrece "Emitir receta" (la página decide cuáles) y qué pasa al pulsarlo.
  canPrescribe?: (entry: RecordEntry) => boolean;
  onPrescribe?: (entry: RecordEntry) => void;
}

export function LineaTiempoExpediente({ entries, canAmend, onAmend, canPrescribe, onPrescribe }: LineaTiempoExpedienteProps) {
  // id de cada nota -> su fecha, para rotular las enmiendas.
  const dateById = new Map(entries.map((entry) => [entry.id, entry.created_at]));

  return (
    <ol aria-label="Historial del expediente" className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id}>
          <EntradaExpediente
            entry={entry}
            correctedDate={entry.amends_id === null ? null : (dateById.get(entry.amends_id) ?? null)}
            canAmend={canAmend}
            onAmend={onAmend}
            canPrescribe={canPrescribe?.(entry) ?? false}
            onPrescribe={onPrescribe}
          />
        </li>
      ))}
    </ol>
  );
}
