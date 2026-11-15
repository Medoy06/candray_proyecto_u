// =============================================================================
// PaginaSucursales.tsx
// Qué hace:     la pantalla de administración de sucursales: lista, crear,
//               editar y activar/desactivar.
// Depende de:   ganchos/useSucursales.ts, componentes/ui y los componentes de
//               esta carpeta.
// Lo usa:       navegacion/RutasAplicacion.tsx (ruta "sucursales", capacidad
//               branches_manage).
//
// No hay "eliminar": una sucursal con historial no se borra, se desactiva (así
// deja de aparecer para el personal pero sus datos se conservan).
// Igual que la de usuarios, esta página es la "directora": guarda qué ventana
// está abierta y qué aviso se muestra.
// =============================================================================
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { AlertaExito } from '../../componentes/ui/AlertaExito';
import { Boton } from '../../componentes/ui/Boton';
import { ConfirmDialog } from '../../componentes/ui/ConfirmDialog';
import { EncabezadoPagina } from '../../componentes/ui/EncabezadoPagina';
import { useSucursales } from '../../ganchos/useSucursales';
import { updateBranch, type ManagedBranch } from '../../servicios/sucursales';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { FormularioSucursal } from './FormularioSucursal';
import { TablaSucursales } from './TablaSucursales';

export function PaginaSucursales() {
  const { status, branches, error, reload } = useSucursales();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ManagedBranch | null>(null);
  const [toggling, setToggling] = useState<ManagedBranch | null>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  // Después de guardar algo: cerrar la ventana, avisar y volver a pedir la lista.
  function finish(message: string) {
    setCreating(false);
    setEditing(null);
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
      await updateBranch(target.id, { is_active: !target.is_active });
      finish(`${target.name} fue ${target.is_active ? 'desactivada' : 'activada'}.`);
    } catch (toggleError: unknown) {
      setActionError(getApiErrorMessage(toggleError, 'No se pudo cambiar el estado de la sucursal.'));
    }
  }

  // Abre una ventana limpiando los avisos anteriores.
  function open<T>(setter: (value: T) => void, value: T) {
    setNotice('');
    setActionError('');
    setter(value);
  }

  return (
    <div>
      <EncabezadoPagina title="Sucursales" description="Las sedes de Candray, su horario y su estado." />

      <div className="mb-4 flex justify-end">
        <Boton variant="primario" onClick={() => open(setCreating, true)}>
          <Plus className="size-4" aria-hidden="true" />
          Nueva sucursal
        </Boton>
      </div>

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

      {status === 'error' && (
        <div className="space-y-3">
          <AlertaError message={error ?? 'No se pudo cargar la lista de sucursales.'} />
          <Boton variant="secundario" onClick={reload}>
            Reintentar
          </Boton>
        </div>
      )}
      {status === 'loading' && branches.length === 0 && <p className="text-sm text-texto-suave">Cargando sucursales...</p>}
      {status === 'ready' && branches.length === 0 && (
        <p className="rounded-lg border border-borde bg-superficie p-6 text-center text-sm text-texto-suave">
          Todavía no hay sucursales. Cree la primera con “Nueva sucursal”.
        </p>
      )}
      {branches.length > 0 && (
        <TablaSucursales
          branches={branches}
          onEdit={(branch) => open(setEditing, branch)}
          onToggleActive={setToggling}
        />
      )}

      {creating && <FormularioSucursal onClose={() => setCreating(false)} onSaved={(saved) => finish(`Se creó la sucursal ${saved.name}.`)} />}
      {editing !== null && (
        <FormularioSucursal
          branch={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => finish(`Cambios guardados para ${saved.name}.`)}
        />
      )}
      <ConfirmDialog
        isOpen={toggling !== null}
        title={toggling?.is_active ? 'Desactivar sucursal' : 'Activar sucursal'}
        message={
          toggling?.is_active
            ? `${toggling.name} dejará de aparecer para el personal. Sus datos se conservan y podrá activarla de nuevo.${
                toggling.user_count > 0 ? ` Tiene ${toggling.user_count} usuario(s) asignado(s).` : ''
              }`
            : `${toggling?.name ?? ''} volverá a estar disponible para el personal.`
        }
        confirmLabel={toggling?.is_active ? 'Desactivar' : 'Activar'}
        danger={toggling?.is_active === true}
        onConfirm={() => void confirmToggle()}
        onCancel={() => setToggling(null)}
      />
    </div>
  );
}
