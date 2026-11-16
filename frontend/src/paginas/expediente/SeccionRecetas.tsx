// =============================================================================
// SeccionRecetas.tsx
// Qué hace:     la tarjeta "Recetas" del expediente: la lista de recetas del
//               paciente, la más reciente primero, con su estado (vigente o
//               reemplazada), quién la emitió y sus medidas. Las vigentes llevan
//               los botones "Reemplazar" e "Imprimir" cuando se pueden usar.
// Depende de:   componentes/ui, MedidasReceta.tsx y servicios/recetas.ts.
// Lo usa:       paginas/expediente/PaginaExpediente.tsx.
//
// No carga ni guarda nada: recibe la carga de la página y avisa qué botón se
// pulsó. Emitir una receta se hace desde la nota de la consulta (en el historial).
// =============================================================================
import { Printer } from 'lucide-react';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { Boton } from '../../componentes/ui/Boton';
import { Etiqueta } from '../../componentes/ui/Etiqueta';
import { Tarjeta } from '../../componentes/ui/Tarjeta';
import type { CargaState } from '../../ganchos/useCarga';
import type { Prescription, PrescriptionList } from '../../servicios/recetas';
import { formatDate, formatDateTime } from '../../utilidades/formatoFecha';
import { MedidasReceta } from './MedidasReceta';

interface SeccionRecetasProps {
  prescriptions: CargaState<PrescriptionList | null> & { reload: () => void };
  canAuthor: boolean; // puede reemplazar (atiende al paciente)
  canPrint: boolean;  // puede imprimir (atiende al paciente y ya se cargaron sus datos)
  onReplace: (prescription: Prescription) => void;
  onPrint: (prescription: Prescription) => void;
}

export function SeccionRecetas({ prescriptions, canAuthor, canPrint, onReplace, onPrint }: SeccionRecetasProps) {
  const rows = prescriptions.data?.rows ?? [];
  // id de cada receta -> su fecha, para rotular las que reemplazan a otra.
  const dateById = new Map(rows.map((row) => [row.id, row.created_at]));

  return (
    <Tarjeta title="Recetas" className="mb-4">
      {prescriptions.status === 'error' && (
        <div className="space-y-3">
          <AlertaError message={prescriptions.error ?? 'No se pudieron cargar las recetas.'} />
          <Boton variant="secundario" onClick={prescriptions.reload}>
            Reintentar
          </Boton>
        </div>
      )}
      {prescriptions.status === 'loading' && prescriptions.data === null && (
        <p className="text-sm text-texto-suave">Cargando recetas...</p>
      )}
      {prescriptions.data !== null && rows.length === 0 && (
        <p className="text-sm text-texto-suave">
          Este paciente todavía no tiene recetas.
          {canAuthor && ' La receta se emite desde la nota de la consulta, más abajo.'}
        </p>
      )}
      {rows.length > 0 && (
        <ul aria-label="Recetas del paciente" className="divide-y divide-borde">
          {rows.map((prescription) => {
            const when = formatDateTime(prescription.created_at);
            const replaced = prescription.supersedes_id === null ? null : dateById.get(prescription.supersedes_id);
            return (
              <li key={prescription.id} className="py-3 first:pt-0 last:pb-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Etiqueta tone={prescription.is_current ? 'exito' : 'neutro'}>
                    {prescription.is_current ? 'Vigente' : 'Reemplazada'}
                  </Etiqueta>
                  <span className="text-sm font-medium text-titulo">{when}</span>
                  <span className="text-sm text-texto-suave">
                    {prescription.doctor_name} · {prescription.branch_name}
                  </span>
                  {prescription.is_current && (canPrint || canAuthor) && (
                    <span className="ml-auto flex gap-2">
                      {canPrint && (
                        <Boton size="sm" onClick={() => onPrint(prescription)} aria-label={`Imprimir la receta del ${when}`}>
                          <Printer className="size-4" aria-hidden="true" />
                          Imprimir
                        </Boton>
                      )}
                      {canAuthor && (
                        <Boton size="sm" onClick={() => onReplace(prescription)} aria-label={`Reemplazar la receta del ${when}`}>
                          Reemplazar
                        </Boton>
                      )}
                    </span>
                  )}
                </div>
                {prescription.supersedes_id !== null && (
                  <p className="mb-2 text-sm text-texto-suave">
                    {replaced === null || replaced === undefined
                      ? 'Reemplaza una receta anterior.'
                      : `Reemplaza la receta del ${formatDate(replaced)}.`}
                  </p>
                )}
                <MedidasReceta measures={prescription} />
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
  );
}
