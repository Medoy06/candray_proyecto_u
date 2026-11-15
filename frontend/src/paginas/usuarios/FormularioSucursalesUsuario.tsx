// =============================================================================
// FormularioSucursalesUsuario.tsx
// Qué hace:     la ventana para cambiar las sucursales de un usuario y cuál es
//               la predeterminada. Reemplaza la lista completa (así funciona la API).
// Depende de:   componentes/ui, servicios/usuarios.ts, servicios/sucursales.ts y
//               paginas/usuarios/SelectorSucursales.tsx.
// Lo usa:       paginas/usuarios/PaginaUsuarios.tsx.
//
// Se ofrecen las sucursales activas MÁS las que el usuario ya tiene aunque estén
// inactivas (marcadas "(inactiva)"): si no, al guardar se quitarían sin avisar.
// Administradores y directivos ven todas las sucursales de todos modos; para ellos
// la asignación es opcional, pero sirve para elegir con cuál entran y para cuando
// cambien a un rol que sí la necesita.
// =============================================================================
import { useEffect, useState, type FormEvent } from 'react';
import { Boton } from '../../componentes/ui/Boton';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { seesAllBranches } from '../../configuracion/roles';
import { listBranches, type ManagedBranch } from '../../servicios/sucursales';
import { setUserBranches, type ManagedUser } from '../../servicios/usuarios';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { SelectorSucursales } from './SelectorSucursales';
import { sameSelection, selectionFromBranches, type BranchSelection } from './seleccionSucursales';

interface FormularioSucursalesUsuarioProps {
  user: ManagedUser;
  onClose: () => void;
  onSaved: (user: ManagedUser) => void;
}

export function FormularioSucursalesUsuario({ user, onClose, onSaved }: FormularioSucursalesUsuarioProps) {
  const initial = selectionFromBranches(user.branches);
  const [selection, setSelection] = useState<BranchSelection>(initial);
  const [branches, setBranches] = useState<ManagedBranch[] | null>(null); // null = cargando
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const assigned = new Set(user.branches.map((branch) => branch.id));
    listBranches()
      .then((all) => {
        if (cancelled) return;
        setBranches(
          all
            .filter((branch) => branch.is_active || assigned.has(branch.id))
            .map((branch) => (branch.is_active ? branch : { ...branch, name: `${branch.name} (inactiva)` })),
        );
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setBranches([]);
          setError(getApiErrorMessage(loadError, 'No se pudieron cargar las sucursales.'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user.branches]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (sameSelection(selection, initial)) {
      setError('No hay cambios que guardar.');
      return;
    }
    if (selection.ids.length === 0 && !seesAllBranches(user.role)) {
      setError('Este rol necesita al menos una sucursal asignada.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      onSaved(
        await setUserBranches(user.id, {
          branch_ids: selection.ids,
          ...(selection.defaultId !== null ? { default_branch_id: selection.defaultId } : {}),
        }),
      );
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, 'No se pudieron guardar las sucursales.'));
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Sucursales del usuario"
      onClose={onClose}
      closeOnBackdrop={false}
      error={error}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton variant="primario" type="submit" form="formulario-sucursales-usuario" disabled={saving || branches === null}>
            {saving ? 'Guardando...' : 'Guardar sucursales'}
          </Boton>
        </>
      }
    >
      <form id="formulario-sucursales-usuario" onSubmit={handleSubmit} noValidate>
        <p className="mb-3 text-sm text-texto">
          <span className="font-medium">{user.full_name}</span>
        </p>
        {seesAllBranches(user.role) && (
          <p className="mb-3 text-xs text-texto-suave">
            Este rol ve todas las sucursales. Asignarlas es opcional: sirve para elegir con cuál entra y para cuando cambie
            a un rol que sí la necesita.
          </p>
        )}
        {branches === null ? (
          <p className="text-sm text-texto-suave">Cargando sucursales...</p>
        ) : (
          <SelectorSucursales branches={branches} value={selection} onChange={setSelection} />
        )}
      </form>
    </ModalShell>
  );
}
