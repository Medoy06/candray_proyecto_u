// =============================================================================
// PaginaPacientes.tsx
// Qué hace:     la pantalla de pacientes: buscar, y (solo recepción) registrar,
//               editar y activar/desactivar.
// Depende de:   ganchos/usePacientes.ts, useValorConRetraso.ts, useSesion.ts,
//               componentes/ui y los componentes de esta carpeta.
// Lo usa:       navegacion/RutasAplicacion.tsx (ruta "pacientes", capacidad
//               patients_search).
//
// Entra quien puede buscar pacientes (médicos, recepción, ventas), pero los
// botones de modificar solo los ve quien tiene patients_manage, y el botón
// "Expediente" solo quien tiene medical_records_read y "Consentimiento" solo
// quien tiene consents_manage: ocultarlos es comodidad;
// quien realmente decide es el backend.
// No hay "eliminar": un paciente con historial no se borra, se desactiva.
// Igual que las demás páginas, esta es la "directora": guarda la búsqueda, la
// página, qué ventana está abierta y qué aviso se muestra.
// La búsqueda espera 300 ms tras la última tecla antes de consultar al servidor
// y, al cambiarla, se vuelve a la página 1.
// =============================================================================
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { AlertaExito } from '../../componentes/ui/AlertaExito';
import { Boton } from '../../componentes/ui/Boton';
import { ConfirmDialog } from '../../componentes/ui/ConfirmDialog';
import { EncabezadoPagina } from '../../componentes/ui/EncabezadoPagina';
import { Paginacion } from '../../componentes/ui/Paginacion';
import { usePacientes } from '../../ganchos/usePacientes';
import { useSesion } from '../../ganchos/useSesion';
import { useValorConRetraso } from '../../ganchos/useValorConRetraso';
import { recordPath } from '../../configuracion/rutas';
import { revokeConsent, type Consent } from '../../servicios/consentimientos';
import { EMPTY_PATIENT_FILTERS, updatePatient, type Patient, type PatientFilters } from '../../servicios/pacientes';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { FiltrosPacientes } from './FiltrosPacientes';
import { FormularioPaciente } from './FormularioPaciente';
import { ModalConsentimiento } from './ModalConsentimiento';
import { TablaPacientes } from './TablaPacientes';

const SEARCH_DELAY_MS = 300;

export function PaginaPacientes() {
  const { can } = useSesion();
  const canManage = can('patients_manage');
  const canOpenRecord = can('medical_records_read');
  const canConsent = can('consents_manage');
  const navigate = useNavigate();
  const [filters, setFilters] = useState<PatientFilters>(EMPTY_PATIENT_FILTERS);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [toggling, setToggling] = useState<Patient | null>(null);
  const [consentOf, setConsentOf] = useState<Patient | null>(null);
  const [revokingConsent, setRevokingConsent] = useState<{ patient: Patient; consent: Consent } | null>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const search = useValorConRetraso(filters.search.trim(), SEARCH_DELAY_MS);
  const { status, data, error, reload } = usePacientes({ search, includeInactive: filters.includeInactive }, page);

  function changeFilters(next: PatientFilters) {
    setFilters(next);
    setPage(1);
  }

  // Después de guardar algo: cerrar la ventana, avisar y volver a pedir la lista.
  function finish(message: string) {
    setCreating(false);
    setEditing(null);
    setConsentOf(null);
    setActionError('');
    setNotice(message);
    reload();
  }

  async function confirmToggle() {
    const target = toggling;
    if (target === null) return;
    setToggling(null); // se cierra de inmediato: evita un doble clic
    setNotice('');
    try {
      await updatePatient(target.id, { is_active: !target.is_active });
      finish(`${target.full_name} fue ${target.is_active ? 'desactivado' : 'activado'}.`);
    } catch (toggleError: unknown) {
      setActionError(getApiErrorMessage(toggleError, 'No se pudo cambiar el estado del paciente.'));
    }
  }

  // Revocar un consentimiento: la ventana del consentimiento se cierra y se
  // pregunta aquí (un ConfirmDialog no va dentro de otra ventana).
  function askRevokeConsent(consent: Consent) {
    if (consentOf === null) return;
    setRevokingConsent({ patient: consentOf, consent });
    setConsentOf(null);
  }

  async function confirmRevokeConsent() {
    const target = revokingConsent;
    if (target === null) return;
    setRevokingConsent(null); // se cierra de inmediato: evita un doble clic
    try {
      await revokeConsent(target.patient.id, target.consent.id);
      finish(`Se revocó el consentimiento de ${target.patient.full_name}.`);
    } catch (revokeError: unknown) {
      setActionError(getApiErrorMessage(revokeError, 'No se pudo revocar el consentimiento.'));
    }
  }

  // Abre una ventana limpiando los avisos anteriores.
  function open<T>(setter: (value: T) => void, value: T) {
    setNotice('');
    setActionError('');
    setter(value);
  }

  const hasSearch = filters.search.trim() !== '';

  return (
    <div>
      <EncabezadoPagina title="Pacientes" description="Buscar pacientes y mantener sus datos de contacto." />

      {canManage && (
        <div className="mb-4 flex justify-end">
          <Boton variant="primario" onClick={() => open(setCreating, true)}>
            <Plus className="size-4" aria-hidden="true" />
            Nuevo paciente
          </Boton>
        </div>
      )}

      {notice !== '' && (
        <div className="mb-4">
          <AlertaExito message={notice} onClose={() => setNotice('')} />
        </div>
      )}
      {actionError !== '' && (
        <div className="mb-4">
          <AlertaError message={actionError} />
        </div>
      )}

      <FiltrosPacientes value={filters} onChange={changeFilters} />

      {status === 'error' && (
        <div className="space-y-3">
          <AlertaError message={error ?? 'No se pudo cargar la lista de pacientes.'} />
          <Boton variant="secundario" onClick={reload}>
            Reintentar
          </Boton>
        </div>
      )}
      {status === 'loading' && data === null && <p className="text-sm text-texto-suave">Cargando pacientes...</p>}
      {data !== null && data.rows.length === 0 && status !== 'error' && (
        <p className="rounded-lg border border-borde bg-superficie p-6 text-center text-sm text-texto-suave">
          {hasSearch ? 'No hay pacientes que coincidan con la búsqueda.' : 'Todavía no hay pacientes registrados.'}
        </p>
      )}
      {data !== null && data.rows.length > 0 && (
        <>
          <TablaPacientes
            patients={data.rows}
            canManage={canManage}
            canOpenRecord={canOpenRecord}
            canConsent={canConsent}
            onOpenRecord={(patient) => navigate(recordPath(patient.id))}
            onConsent={(patient) => open(setConsentOf, patient)}
            onEdit={(patient) => open(setEditing, patient)}
            onToggleActive={setToggling}
          />
          <Paginacion
            page={data.pagination.page}
            totalPages={data.pagination.total_pages}
            total={data.pagination.total}
            noun="pacientes"
            disabled={status === 'loading'}
            onPageChange={setPage}
          />
        </>
      )}

      {creating && (
        <FormularioPaciente onClose={() => setCreating(false)} onSaved={(saved) => finish(`Paciente ${saved.full_name} registrado.`)} />
      )}
      {editing !== null && (
        <FormularioPaciente
          patient={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => finish(`Cambios guardados para ${saved.full_name}.`)}
        />
      )}
      {consentOf !== null && (
        <ModalConsentimiento
          patient={consentOf}
          onClose={() => setConsentOf(null)}
          onSaved={finish}
          onRevoke={askRevokeConsent}
        />
      )}
      <ConfirmDialog
        isOpen={revokingConsent !== null}
        title="Revocar consentimiento"
        message={`La óptica dejará de poder ver la receta de ${revokingConsent?.patient.full_name ?? ''}.`}
        confirmLabel="Revocar"
        danger
        onConfirm={() => void confirmRevokeConsent()}
        onCancel={() => setRevokingConsent(null)}
      />
      <ConfirmDialog
        isOpen={toggling !== null}
        title={toggling?.is_active ? 'Desactivar paciente' : 'Activar paciente'}
        message={
          toggling?.is_active
            ? `${toggling.full_name} dejará de aparecer en las búsquedas normales. Sus datos se conservan y podrá activarlo de nuevo.`
            : `${toggling?.full_name ?? ''} volverá a aparecer en las búsquedas.`
        }
        confirmLabel={toggling?.is_active ? 'Desactivar' : 'Activar'}
        danger={toggling?.is_active === true}
        onConfirm={() => void confirmToggle()}
        onCancel={() => setToggling(null)}
      />
    </div>
  );
}
