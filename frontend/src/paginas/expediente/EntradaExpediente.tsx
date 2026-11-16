// =============================================================================
// EntradaExpediente.tsx
// Qué hace:     dibuja UNA entrada del expediente: una nota de consulta o una
//               enmienda, con quién la escribió, cuándo y en qué sucursal.
// Depende de:   componentes/ui (Boton, Etiqueta) y servicios/expedientes.ts
//               (el tipo RecordEntry).
// Lo usa:       paginas/expediente/LineaTiempoExpediente.tsx.
//
// No decide nada: si hay botón de enmendar o de emitir receta y qué pasa al
// pulsarlo lo manda la página. Los campos vacíos (tratamiento, notas) no se dibujan.
// =============================================================================
import { Boton } from '../../componentes/ui/Boton';
import { Etiqueta } from '../../componentes/ui/Etiqueta';
import type { RecordEntry } from '../../servicios/expedientes';
import { formatDate, formatDateTime } from '../../utilidades/formatoFecha';

interface EntradaExpedienteProps {
  entry: RecordEntry;
  // La fecha de la nota que esta entrada corrige, si está en la página que se ve.
  correctedDate: string | null;
  canAmend: boolean;
  onAmend: (entry: RecordEntry) => void;
  // Botón "Emitir receta" (solo en las notas de consulta que todavía no tienen la suya).
  canPrescribe?: boolean;
  onPrescribe?: (entry: RecordEntry) => void;
}

// Un dato de la nota (diagnóstico, tratamiento...) con su título.
function Dato({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-texto-suave">{title}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-texto">{text}</dd>
    </div>
  );
}

export function EntradaExpediente({ entry, correctedDate, canAmend, onAmend, canPrescribe = false, onPrescribe }: EntradaExpedienteProps) {
  const isAmendment = entry.amends_id !== null;

  return (
    <article className="rounded-lg border border-borde bg-superficie p-4">
      <header className="flex flex-wrap items-center gap-2">
        <Etiqueta tone={isAmendment ? 'aviso' : 'info'}>{isAmendment ? 'Enmienda' : 'Consulta'}</Etiqueta>
        <span className="text-sm font-medium text-titulo">{formatDateTime(entry.created_at)}</span>
        <span className="text-sm text-texto-suave">
          {entry.doctor_name} · {entry.branch_name}
        </span>
        {entry.amendment_count > 0 && (
          <Etiqueta tone="neutro">
            {entry.amendment_count === 1 ? 'Enmendada 1 vez' : `Enmendada ${entry.amendment_count} veces`}
          </Etiqueta>
        )}
        {(canAmend || canPrescribe) && (
          <span className="ml-auto flex gap-2">
            {canPrescribe && (
              <Boton size="sm" onClick={() => onPrescribe?.(entry)} aria-label={`Emitir la receta de la nota del ${formatDateTime(entry.created_at)}`}>
                Emitir receta
              </Boton>
            )}
            {canAmend && (
              <Boton size="sm" onClick={() => onAmend(entry)} aria-label={`Enmendar la nota del ${formatDateTime(entry.created_at)}`}>
                Enmendar
              </Boton>
            )}
          </span>
        )}
      </header>

      {isAmendment ? (
        <p className="mt-2 text-sm text-texto-suave">
          {correctedDate === null ? 'Corrige una nota anterior.' : `Corrige la nota del ${formatDate(correctedDate)}.`}
        </p>
      ) : (
        <p className="mt-2 text-sm text-texto-suave">Consulta del {formatDateTime(entry.appointment_starts_at)}.</p>
      )}

      <dl className="mt-3 space-y-3">
        <Dato title="Diagnóstico" text={entry.diagnosis} />
        {entry.treatment !== null && <Dato title="Tratamiento" text={entry.treatment} />}
        {entry.notes !== null && <Dato title="Notas" text={entry.notes} />}
      </dl>
    </article>
  );
}
