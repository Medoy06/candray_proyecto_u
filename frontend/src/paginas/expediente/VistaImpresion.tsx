// =============================================================================
// VistaImpresion.tsx
// Qué hace:     el documento que sale en papel: encabezado de la clínica, datos
//               del paciente, quién y cuándo lo imprimió, y todas las entradas
//               del expediente de la más antigua a la más reciente.
// Depende de:   paginas/expediente/LineaTiempoExpediente.tsx y servicios/*.
// Lo usa:       paginas/expediente/PaginaExpediente.tsx.
//
// En pantalla está oculto (hidden) y solo se ve al imprimir (print:block); al
// imprimir, el resto de la aplicación se oculta. Las entradas son las mismas
// del historial, sin botones. Si el expediente es más largo de lo que se
// imprime, el documento lo dice.
// =============================================================================
import type { RecordEntry } from '../../servicios/expedientes';
import type { Patient } from '../../servicios/pacientes';
import { formatDate } from '../../utilidades/formatoFecha';
import { LineaTiempoExpediente } from './LineaTiempoExpediente';

interface VistaImpresionProps {
  patient: Patient;
  entries: RecordEntry[];   // de la más reciente a la más antigua, como llegan
  total: number;
  truncated: boolean;
  printedBy: string;        // nombre de quien imprime
  printedOn: string;        // "AAAA-MM-DD"
}

export function VistaImpresion({ patient, entries, total, truncated, printedBy, printedOn }: VistaImpresionProps) {
  // En papel se lee de la más antigua a la más reciente.
  const chronological = [...entries].reverse();

  return (
    <section aria-label="Documento para imprimir" className="hidden print:block">
      <header className="mb-4 border-b border-borde-fuerte pb-3">
        <p className="font-titulo text-sm font-semibold uppercase tracking-wide text-texto-suave">Clínicas y Ópticas Candray</p>
        <h1 className="font-titulo text-2xl font-semibold text-titulo">Expediente clínico: {patient.full_name}</h1>
        <p className="text-sm text-texto">
          Expediente N.º {patient.record_number} · Nacimiento {formatDate(patient.birth_date)}
        </p>
        <p className="text-xs text-texto-suave">
          Impreso el {formatDate(printedOn)} por {printedBy}. Documento confidencial.
        </p>
      </header>
      {truncated && (
        <p className="mb-3 text-sm text-texto">
          Se imprimen las {entries.length} entradas más recientes de {total}.
        </p>
      )}
      <LineaTiempoExpediente entries={chronological} canAmend={false} onAmend={() => undefined} />
    </section>
  );
}
