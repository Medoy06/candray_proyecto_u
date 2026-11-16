// =============================================================================
// PaginaExpediente.tsx
// Qué hace:     el expediente clínico de UN paciente: su historial de consultas
//               (de todas las sucursales), y para el médico que lo atiende,
//               escribir la nota de una consulta y enmendar notas.
// Depende de:   ganchos/useExpediente.ts, usePaciente.ts, useSesion.ts,
//               componentes/ui y los componentes de esta carpeta.
// Lo usa:       navegacion/RutasAplicacion.tsx (ruta del expediente, capacidad
//               medical_records_read). Se abre desde la lista de pacientes.
//
// Quién puede ver qué NO se decide aquí: lo decide el servidor. Si la persona no
// atiende al paciente ni tiene una interconsulta vigente, el servidor responde
// 403 (y deja constancia en la bitácora) y aquí solo se muestra ese mensaje.
// Lo que sí se decide aquí es qué botones mostrar: escribir y enmendar solo
// aparecen cuando se tiene la capacidad Y el acceso es por atender al paciente
// (quien entra por interconsulta o como administrador solo lee).
// La sección de interconsultas (dar y revocar acceso a otro médico) sigue la misma
// regla y vive en su propio componente.
// Cada vez que se carga el historial queda una lectura en la bitácora, por eso
// solo se vuelve a cargar al cambiar de página o después de guardar.
// Igual que las demás páginas, esta es la "directora": guarda la página, qué
// ventana está abierta y qué aviso se muestra.
// =============================================================================
import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { AlertaExito } from '../../componentes/ui/AlertaExito';
import { Boton } from '../../componentes/ui/Boton';
import { EncabezadoPagina } from '../../componentes/ui/EncabezadoPagina';
import { Paginacion } from '../../componentes/ui/Paginacion';
import { useExpediente } from '../../ganchos/useExpediente';
import { usePaciente } from '../../ganchos/usePaciente';
import { useSesion } from '../../ganchos/useSesion';
import type { RecordEntry } from '../../servicios/expedientes';
import { formatDate } from '../../utilidades/formatoFecha';
import { AvisoAcceso } from './AvisoAcceso';
import { FormularioEnmienda } from './FormularioEnmienda';
import { FormularioNota } from './FormularioNota';
import { LineaTiempoExpediente } from './LineaTiempoExpediente';
import { SeccionInterconsultas } from './SeccionInterconsultas';

export function PaginaExpediente() {
  const { patientId = '' } = useParams();
  const { can } = useSesion();
  const [page, setPage] = useState(1);
  const [writing, setWriting] = useState(false);
  const [amending, setAmending] = useState<RecordEntry | null>(null);
  const [notice, setNotice] = useState('');

  const patient = usePaciente(patientId);
  const history = useExpediente(patientId, page);

  // Escribir y enmendar: la capacidad no basta, el acceso debe ser por atender al paciente.
  const canWrite = can('medical_records_author') && history.data?.access.reason === 'appointment';

  // Dar interconsultas: la capacidad y atender al paciente (una interconsulta recibida no se puede pasar a otro).
  const canGrantReferrals = can('referrals_manage') && history.data?.access.reason === 'appointment';

  // Después de guardar: cerrar la ventana, avisar y volver a la primera página (lo más nuevo).
  function finish(message: string) {
    setWriting(false);
    setAmending(null);
    setNotice(message);
    if (page !== 1) setPage(1); // el cambio de página ya recarga
    else history.reload();
  }

  const name = patient.data?.full_name ?? 'Paciente';
  const description =
    patient.data === null
      ? 'Historial clínico del paciente.'
      : `Expediente N.º ${patient.data.record_number} · Nacimiento ${formatDate(patient.data.birth_date)}`;

  return (
    <div>
      <Link to="/pacientes" className="mb-3 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-titulo">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a pacientes
      </Link>
      <EncabezadoPagina title={name} description={description} />

      {history.status === 'error' && (
        <div className="space-y-3">
          <AlertaError message={history.error ?? 'No se pudo cargar el expediente.'} />
          <Boton variant="secundario" onClick={history.reload}>
            Reintentar
          </Boton>
        </div>
      )}
      {history.status === 'loading' && history.data === null && (
        <p className="text-sm text-texto-suave">Cargando expediente...</p>
      )}

      {history.data !== null && (
        <>
          <AvisoAcceso access={history.data.access} />

          {canGrantReferrals && <SeccionInterconsultas patientId={patientId} />}

          {canWrite && (
            <div className="mb-4 flex justify-end">
              <Boton
                variant="primario"
                onClick={() => {
                  setNotice('');
                  setWriting(true);
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                Nueva nota
              </Boton>
            </div>
          )}

          {notice !== '' && (
            <div className="mb-4">
              <AlertaExito message={notice} onClose={() => setNotice('')} />
            </div>
          )}

          {history.data.rows.length === 0 ? (
            <p className="rounded-lg border border-borde bg-superficie p-6 text-center text-sm text-texto-suave">
              Este paciente todavía no tiene notas en su expediente.
            </p>
          ) : (
            <>
              <LineaTiempoExpediente
                entries={history.data.rows}
                canAmend={canWrite}
                onAmend={(entry) => {
                  setNotice('');
                  setAmending(entry);
                }}
              />
              <Paginacion
                page={history.data.pagination.page}
                totalPages={history.data.pagination.total_pages}
                total={history.data.pagination.total}
                noun="entradas"
                disabled={history.status === 'loading'}
                onPageChange={setPage}
              />
            </>
          )}
        </>
      )}

      {writing && (
        <FormularioNota patientId={patientId} onClose={() => setWriting(false)} onSaved={() => finish('Nota guardada en el expediente.')} />
      )}
      {amending !== null && (
        <FormularioEnmienda
          patientId={patientId}
          original={amending}
          onClose={() => setAmending(null)}
          onSaved={() => finish('Enmienda guardada en el expediente.')}
        />
      )}
    </div>
  );
}
