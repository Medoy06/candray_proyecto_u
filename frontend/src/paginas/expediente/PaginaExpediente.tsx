// =============================================================================
// PaginaExpediente.tsx
// Qué hace:     el expediente clínico de UN paciente: su historial de consultas
//               (de todas las sucursales), y para el médico que lo atiende,
//               escribir la nota de una consulta, enmendar notas y emitir recetas.
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
// El botón "Imprimir expediente" pide el expediente completo al servidor (queda en la
// bitácora), dibuja el documento (VistaImpresion, oculto en pantalla) y abre el
// diálogo de impresión del navegador. Solo lo ve el médico que atiende al paciente.
// La sección de interconsultas (dar y revocar acceso a otro médico) sigue la misma
// regla y vive en su propio componente.
// Recetas: quien tiene la capacidad de leerlas ve la tarjeta "Recetas". El médico que
// atiende al paciente además puede emitir la receta de una de SUS notas de consulta
// (botón en la nota), reemplazar la vigente e imprimirla. La receta impresa sale de
// los datos ya cargados: la lectura ya quedó en la bitácora al cargar la tarjeta.
// Cada vez que se carga el historial queda una lectura en la bitácora, por eso
// solo se vuelve a cargar al cambiar de página o después de guardar.
// Igual que las demás páginas, esta es la "directora": guarda la página, qué
// ventana está abierta y qué aviso se muestra.
// =============================================================================
import { ArrowLeft, Plus, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { AlertaExito } from '../../componentes/ui/AlertaExito';
import { Boton } from '../../componentes/ui/Boton';
import { EncabezadoPagina } from '../../componentes/ui/EncabezadoPagina';
import { Paginacion } from '../../componentes/ui/Paginacion';
import { useExpediente } from '../../ganchos/useExpediente';
import { useImprimirAlMostrar } from '../../ganchos/useImprimirAlMostrar';
import { usePaciente } from '../../ganchos/usePaciente';
import { useRecetas } from '../../ganchos/useRecetas';
import { useSesion } from '../../ganchos/useSesion';
import { getRecordPrintout, type RecordEntry, type RecordPrintout } from '../../servicios/expedientes';
import type { Prescription } from '../../servicios/recetas';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { todayText } from '../../utilidades/fechaLocal';
import { formatDate } from '../../utilidades/formatoFecha';
import { AvisoAcceso } from './AvisoAcceso';
import { FormularioEnmienda } from './FormularioEnmienda';
import { FormularioNota } from './FormularioNota';
import { FormularioReceta, type PrescriptionTarget } from './FormularioReceta';
import { LineaTiempoExpediente } from './LineaTiempoExpediente';
import { SeccionInterconsultas } from './SeccionInterconsultas';
import { SeccionRecetas } from './SeccionRecetas';
import { VistaImpresion } from './VistaImpresion';
import { VistaRecetaImpresion } from './VistaRecetaImpresion';

export function PaginaExpediente() {
  const { patientId = '' } = useParams();
  const { can, user } = useSesion();
  const [page, setPage] = useState(1);
  const [writing, setWriting] = useState(false);
  const [amending, setAmending] = useState<RecordEntry | null>(null);
  const [notice, setNotice] = useState('');
  const [printout, setPrintout] = useState<RecordPrintout | null>(null);
  const [printLoading, setPrintLoading] = useState(false);
  const [printError, setPrintError] = useState('');
  const [prescribing, setPrescribing] = useState<PrescriptionTarget | null>(null);
  const [prescriptionToPrint, setPrescriptionToPrint] = useState<Prescription | null>(null);

  const patient = usePaciente(patientId);
  const history = useExpediente(patientId, page);
  const canReadPrescriptions = can('prescriptions_read');
  const prescriptions = useRecetas(patientId, canReadPrescriptions);

  // Escribir y enmendar: la capacidad no basta, el acceso debe ser por atender al paciente.
  const canWrite = can('medical_records_author') && history.data?.access.reason === 'appointment';

  // Dar interconsultas: la capacidad y atender al paciente (una interconsulta recibida no se puede pasar a otro).
  const canGrantReferrals = can('referrals_manage') && history.data?.access.reason === 'appointment';

  // Imprimir: la capacidad y atender al paciente (el servidor lo vuelve a exigir).
  const canPrint = can('medical_records_output') && history.data?.access.reason === 'appointment';

  // Emitir, reemplazar e imprimir recetas: la capacidad y atender al paciente (el servidor lo vuelve a exigir).
  const canAuthorPrescriptions = can('prescriptions_author') && history.data?.access.reason === 'appointment';

  // "Emitir receta" aparece en las notas de consulta propias que todavía no tienen la suya
  // (y solo cuando ya se cargaron las recetas, para no ofrecerla por error).
  const prescribedRecordIds = new Set(prescriptions.data?.rows.map((row) => row.record_id));
  const canPrescribeFrom = (entry: RecordEntry): boolean =>
    canAuthorPrescriptions &&
    prescriptions.data !== null &&
    entry.amends_id === null &&
    entry.doctor_id === user?.id &&
    !prescribedRecordIds.has(entry.id);

  // Pide el expediente completo (queda en la bitácora) y deja listo el documento.
  async function preparePrint() {
    setPrintLoading(true);
    setPrintError('');
    try {
      setPrintout(await getRecordPrintout(patientId));
    } catch (printProblem: unknown) {
      setPrintError(getApiErrorMessage(printProblem, 'No se pudo preparar la impresión.'));
    } finally {
      setPrintLoading(false);
    }
  }

  // Cuando el documento (el expediente o una receta) ya está dibujado, se abre el
  // diálogo de impresión del navegador y, al cerrarse, se descarta (una impresión
  // nueva pide datos nuevos).
  useImprimirAlMostrar(printout ?? prescriptionToPrint, () => {
    setPrintout(null);
    setPrescriptionToPrint(null);
  });

  // Después de emitir o reemplazar una receta: cerrar la ventana, avisar y recargar la tarjeta.
  function finishPrescription(message: string) {
    setPrescribing(null);
    setNotice(message);
    prescriptions.reload();
  }

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
    <>
      <div className="print:hidden">
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

            {canReadPrescriptions && (
              <SeccionRecetas
                prescriptions={prescriptions}
                canAuthor={canAuthorPrescriptions}
                canPrint={canAuthorPrescriptions && patient.data !== null}
                onReplace={(original) => {
                  setNotice('');
                  setPrescribing({ kind: 'replace', original });
                }}
                onPrint={setPrescriptionToPrint}
              />
            )}

            {printError !== '' && (
              <div className="mb-4">
                <AlertaError message={printError} />
              </div>
            )}

            {(canPrint || canWrite) && (
              <div className="mb-4 flex flex-wrap justify-end gap-3">
                {canPrint && (
                  <Boton onClick={() => void preparePrint()} disabled={printLoading}>
                    <Printer className="size-4" aria-hidden="true" />
                    {printLoading ? 'Preparando...' : 'Imprimir expediente'}
                  </Boton>
                )}
                {canWrite && (
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
                )}
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
                  canPrescribe={canPrescribeFrom}
                  onPrescribe={(record) => {
                    setNotice('');
                    setPrescribing({ kind: 'issue', record });
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
        {prescribing !== null && (
          <FormularioReceta
            patientId={patientId}
            target={prescribing}
            onClose={() => setPrescribing(null)}
            onSaved={() =>
              finishPrescription(prescribing.kind === 'issue' ? 'Receta emitida.' : 'Receta reemplazada: la nueva quedó vigente.')
            }
          />
        )}
      </div>
    {prescriptionToPrint !== null && patient.data !== null && (
      <VistaRecetaImpresion patient={patient.data} prescription={prescriptionToPrint} />
    )}
    {printout !== null && patient.data !== null && (
      <VistaImpresion
        patient={patient.data}
        entries={printout.rows}
        total={printout.total}
        truncated={printout.truncated}
        printedBy={user?.full_name ?? ''}
        printedOn={todayText()}
      />
    )}
    </>
  );
}
