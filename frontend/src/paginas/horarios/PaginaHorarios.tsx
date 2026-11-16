// =============================================================================
// PaginaHorarios.tsx
// Qué hace:     la pantalla de administración de los horarios semanales de los
//               médicos: se elige un médico y se ven, crean, editan y eliminan
//               sus bloques de atención.
// Depende de:   ganchos/useHorarios.ts, ganchos/useSucursales.ts,
//               servicios/usuarios.ts, componentes/ui y los componentes de esta
//               carpeta.
// Lo usa:       navegacion/RutasAplicacion.tsx (ruta "horarios", capacidad
//               schedules_manage).
//
// Es la página "directora": guarda qué ventana está abierta y qué aviso se
// muestra. Las sucursales que se ofrecen para un bloque son las activas en las
// que el médico trabaja (las que tiene asignadas). Eliminar pide confirmación.
// =============================================================================
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { AlertaExito } from '../../componentes/ui/AlertaExito';
import { Boton } from '../../componentes/ui/Boton';
import { ConfirmDialog } from '../../componentes/ui/ConfirmDialog';
import { EncabezadoPagina } from '../../componentes/ui/EncabezadoPagina';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { useCarga } from '../../ganchos/useCarga';
import { useHorarios } from '../../ganchos/useHorarios';
import { useSucursales } from '../../ganchos/useSucursales';
import { deleteSchedule, type ScheduleBlock } from '../../servicios/horarios';
import { listUsers } from '../../servicios/usuarios';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { WEEKDAY_LABELS } from './etiquetasHorarios';
import { FormularioHorario } from './FormularioHorario';
import { TablaHorarios } from './TablaHorarios';

export function PaginaHorarios() {
  const doctors = useCarga(() => listUsers({ role: 'doctor', is_active: true }), [], 'No se pudo cargar la lista de médicos.');
  const { branches } = useSucursales();
  const [chosenId, setChosenId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ScheduleBlock | null>(null);
  const [deleting, setDeleting] = useState<ScheduleBlock | null>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  // Mientras no se elija a nadie, se usa el primer médico de la lista.
  const doctorList = doctors.data ?? [];
  const doctor = doctorList.find((item) => item.id === chosenId) ?? doctorList[0] ?? null;
  const schedules = useHorarios(doctor?.id ?? '');

  // Sucursales activas en las que trabaja el médico.
  const doctorBranchIds = new Set(doctor?.branches.map((item) => item.id) ?? []);
  const offeredBranches = branches.filter((branch) => branch.is_active && doctorBranchIds.has(branch.id));

  // Después de guardar o eliminar: cerrar la ventana, avisar y volver a pedir la lista.
  function finish(message: string) {
    setCreating(false);
    setEditing(null);
    setActionError('');
    setNotice(message);
    schedules.reload();
  }

  async function confirmDelete() {
    const target = deleting;
    if (target === null) return;
    setDeleting(null); // se cierra de inmediato: evita un doble clic
    setNotice('');
    try {
      await deleteSchedule(target.id);
      finish('Bloque eliminado.');
    } catch (deleteError: unknown) {
      setActionError(getApiErrorMessage(deleteError, 'No se pudo eliminar el bloque.'));
    }
  }

  // Abre una ventana limpiando los avisos anteriores.
  function open<T>(setter: (value: T) => void, value: T) {
    setNotice('');
    setActionError('');
    setter(value);
  }

  function chooseDoctor(id: string) {
    setNotice('');
    setActionError('');
    setChosenId(id);
  }

  const blocks = schedules.data ?? [];

  return (
    <div>
      <EncabezadoPagina title="Horarios de médicos" description="Los días y horas en que cada médico atiende en cada sucursal." />

      {doctors.status === 'error' && <AlertaError message={doctors.error ?? 'No se pudo cargar la lista de médicos.'} />}
      {doctors.status === 'ready' && doctorList.length === 0 && (
        <p className="rounded-lg border border-borde bg-superficie p-6 text-center text-sm text-texto-suave">
          No hay médicos activos. Cree uno desde la pantalla de usuarios.
        </p>
      )}

      {doctor !== null && (
        <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <FormField label="Médico" className="w-full max-w-xs">
              <select className={inputClass} value={doctor.id} onChange={(event) => chooseDoctor(event.target.value)}>
                {doctorList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.full_name}
                  </option>
                ))}
              </select>
            </FormField>
            <Boton variant="primario" onClick={() => open(setCreating, true)} disabled={offeredBranches.length === 0}>
              <Plus className="size-4" aria-hidden="true" />
              Nuevo bloque
            </Boton>
          </div>

          {offeredBranches.length === 0 && (
            <p role="status" className="mb-4 rounded-md bg-aviso-fondo px-3 py-2 text-sm text-aviso-texto">
              Este médico no tiene una sucursal activa asignada. Asígnela desde la pantalla de usuarios para poder darle horario.
            </p>
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

          {schedules.status === 'error' && (
            <div className="space-y-3">
              <AlertaError message={schedules.error ?? 'No se pudieron cargar los horarios.'} />
              <Boton variant="secundario" onClick={schedules.reload}>
                Reintentar
              </Boton>
            </div>
          )}
          {schedules.status === 'loading' && schedules.data === null && (
            <p className="text-sm text-texto-suave">Cargando horarios...</p>
          )}
          {schedules.status === 'ready' && blocks.length === 0 && (
            <p className="rounded-lg border border-borde bg-superficie p-6 text-center text-sm text-texto-suave">
              {doctor.full_name} todavía no tiene horario. Cree el primer bloque con “Nuevo bloque”.
            </p>
          )}
          {blocks.length > 0 && (
            <TablaHorarios blocks={blocks} onEdit={(block) => open(setEditing, block)} onDelete={setDeleting} />
          )}

          {creating && (
            <FormularioHorario
              doctorId={doctor.id}
              doctorName={doctor.full_name}
              block={null}
              branches={offeredBranches}
              onClose={() => setCreating(false)}
              onSaved={() => finish('Bloque creado.')}
            />
          )}
          {editing !== null && (
            <FormularioHorario
              doctorId={doctor.id}
              doctorName={doctor.full_name}
              block={editing}
              branches={offeredBranches}
              onClose={() => setEditing(null)}
              onSaved={() => finish('Bloque actualizado.')}
            />
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={deleting !== null}
        title="Eliminar bloque"
        message={
          deleting === null
            ? ''
            : `Se eliminará el bloque del ${WEEKDAY_LABELS[deleting.weekday]?.toLowerCase() ?? ''} en ${deleting.branch_name}. Si tiene citas futuras sin otro bloque que las cubra, el sistema no lo permitirá.`
        }
        confirmLabel="Eliminar"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
