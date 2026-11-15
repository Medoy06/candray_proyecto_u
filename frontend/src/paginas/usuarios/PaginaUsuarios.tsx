// =============================================================================
// PaginaUsuarios.tsx
// Qué hace:     la pantalla de administración de usuarios: lista con filtros,
//               crear, editar y activar/desactivar.
// Depende de:   ganchos/useUsuarios.ts, useValorConRetraso.ts, useSesion.ts,
//               componentes/ui y los componentes de esta carpeta.
// Lo usa:       navegacion/RutasAplicacion.tsx (ruta "usuarios", capacidad
//               users_manage).
//
// Esta página es la "directora": guarda qué ventana está abierta y qué aviso se
// muestra; la tabla y los formularios solo le avisan lo que pasa.
// La búsqueda espera 300 ms tras la última tecla antes de consultar al servidor.
// =============================================================================
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { AlertaExito } from '../../componentes/ui/AlertaExito';
import { Boton } from '../../componentes/ui/Boton';
import { ConfirmDialog } from '../../componentes/ui/ConfirmDialog';
import { EncabezadoPagina } from '../../componentes/ui/EncabezadoPagina';
import type { Role } from '../../configuracion/roles';
import { useSesion } from '../../ganchos/useSesion';
import { useUsuarios } from '../../ganchos/useUsuarios';
import { useValorConRetraso } from '../../ganchos/useValorConRetraso';
import { updateUser, type ManagedUser } from '../../servicios/usuarios';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { FiltrosUsuarios, type UserFilterValues } from './FiltrosUsuarios';
import { FormularioCrearUsuario } from './FormularioCrearUsuario';
import { FormularioEditarUsuario } from './FormularioEditarUsuario';
import { TablaUsuarios } from './TablaUsuarios';

const SEARCH_DELAY_MS = 300;

export function PaginaUsuarios() {
  const { user: currentUser } = useSesion();
  const [filters, setFilters] = useState<UserFilterValues>({ search: '', role: '', status: '' });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [toggling, setToggling] = useState<ManagedUser | null>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const search = useValorConRetraso(filters.search.trim(), SEARCH_DELAY_MS);
  const { status, users, error, reload } = useUsuarios({
    role: filters.role === '' ? undefined : (filters.role as Role),
    is_active: filters.status === '' ? undefined : filters.status === 'activos',
    search,
  });

  if (currentUser === null) return null;

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
      await updateUser(target.id, { is_active: !target.is_active });
      finish(`${target.full_name} fue ${target.is_active ? 'desactivado' : 'activado'}.`);
    } catch (toggleError: unknown) {
      setActionError(getApiErrorMessage(toggleError, 'No se pudo cambiar el estado del usuario.'));
    }
  }

  return (
    <div>
      <EncabezadoPagina title="Usuarios" description="Cuentas del personal, sus roles y su acceso." />

      <div className="mb-4 flex justify-end">
        <Boton
          variant="primario"
          onClick={() => {
            setNotice('');
            setActionError('');
            setCreating(true);
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          Nuevo usuario
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

      <FiltrosUsuarios value={filters} onChange={setFilters} />

      {status === 'error' && (
        <div className="space-y-3">
          <AlertaError message={error ?? 'No se pudo cargar la lista de usuarios.'} />
          <Boton variant="secundario" onClick={reload}>
            Reintentar
          </Boton>
        </div>
      )}
      {status === 'loading' && users.length === 0 && <p className="text-sm text-texto-suave">Cargando usuarios...</p>}
      {status === 'ready' && users.length === 0 && (
        <p className="rounded-lg border border-borde bg-superficie p-6 text-center text-sm text-texto-suave">
          No hay usuarios que coincidan con los filtros.
        </p>
      )}
      {users.length > 0 && (
        <TablaUsuarios
          users={users}
          currentUserId={currentUser.id}
          onEdit={(user) => {
            setNotice('');
            setActionError('');
            setEditing(user);
          }}
          onToggleActive={setToggling}
        />
      )}

      {creating && (
        <FormularioCrearUsuario
          onClose={() => setCreating(false)}
          onCreated={(created) => finish(`Usuario ${created.full_name} creado.`)}
        />
      )}
      {editing !== null && (
        <FormularioEditarUsuario
          user={editing}
          isSelf={editing.id === currentUser.id}
          onClose={() => setEditing(null)}
          onSaved={(saved) => finish(`Cambios guardados para ${saved.full_name}.`)}
        />
      )}
      <ConfirmDialog
        isOpen={toggling !== null}
        title={toggling?.is_active ? 'Desactivar usuario' : 'Activar usuario'}
        message={
          toggling?.is_active
            ? `${toggling.full_name} ya no podrá iniciar sesión. Podrá activarlo de nuevo cuando quiera.`
            : `${toggling?.full_name ?? ''} podrá volver a iniciar sesión.`
        }
        confirmLabel={toggling?.is_active ? 'Desactivar' : 'Activar'}
        danger={toggling?.is_active === true}
        onConfirm={() => void confirmToggle()}
        onCancel={() => setToggling(null)}
      />
    </div>
  );
}
