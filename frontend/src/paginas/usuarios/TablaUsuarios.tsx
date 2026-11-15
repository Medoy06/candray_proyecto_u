// =============================================================================
// TablaUsuarios.tsx
// Qué hace:     define las columnas de la tabla de usuarios (nombre y correo,
//               rol, sucursales, estado, último acceso y acciones) y las dibuja
//               con el componente genérico Tabla.
// Depende de:   componentes/ui (Tabla, Boton, Etiqueta), configuracion/roles.ts y
//               utilidades/formatoFecha.ts.
// Lo usa:       paginas/usuarios/PaginaUsuarios.tsx.
//
// No decide nada: avisa a la página cuando se pulsa una acción. En su PROPIA
// fila no se ofrece desactivar (el backend tampoco lo permite). "Desbloquear"
// solo aparece en cuentas bloqueadas. Las acciones de edición son botones de
// icono (con título al pasar el cursor y nombre accesible); activar/desactivar
// lleva texto porque cambia el estado y tiene color propio.
// =============================================================================
import { Building2, KeyRound, LockOpen, Pencil } from 'lucide-react';
import { Boton } from '../../componentes/ui/Boton';
import { Etiqueta } from '../../componentes/ui/Etiqueta';
import { Tabla, type TablaColumna } from '../../componentes/ui/Tabla';
import { ROLE_LABELS, seesAllBranches } from '../../configuracion/roles';
import type { ManagedUser } from '../../servicios/usuarios';
import { formatDateTime } from '../../utilidades/formatoFecha';

interface TablaUsuariosProps {
  users: ManagedUser[];
  currentUserId: string;
  onEdit: (user: ManagedUser) => void;
  onBranches: (user: ManagedUser) => void;
  onPassword: (user: ManagedUser) => void;
  onUnlock: (user: ManagedUser) => void;
  onToggleActive: (user: ManagedUser) => void;
}

// Qué sucursales se muestran: administradores y directivos ven todas.
function branchesText(user: ManagedUser): string {
  if (seesAllBranches(user.role)) return 'Todas';
  if (user.branches.length === 0) return 'Sin sucursales';
  return user.branches.map((branch) => branch.name).join(', ');
}

export function TablaUsuarios({
  users,
  currentUserId,
  onEdit,
  onBranches,
  onPassword,
  onUnlock,
  onToggleActive,
}: TablaUsuariosProps) {
  const columns: TablaColumna<ManagedUser>[] = [
    {
      id: 'user',
      header: 'Usuario',
      cell: (user) => (
        <>
          <p className="flex flex-wrap items-center gap-x-2 font-medium text-texto">
            {user.full_name}
            {user.id === currentUserId && <span className="text-xs font-normal text-texto-suave">(usted)</span>}
          </p>
          <p className="text-xs text-texto-suave">{user.email}</p>
        </>
      ),
    },
    { id: 'role', header: 'Rol', noWrap: true, cell: (user) => ROLE_LABELS[user.role] },
    { id: 'branches', header: 'Sucursales', cell: branchesText },
    {
      id: 'status',
      header: 'Estado',
      cell: (user) => (
        <div className="flex flex-wrap gap-1">
          <Etiqueta tone={user.is_active ? 'exito' : 'neutro'}>{user.is_active ? 'Activo' : 'Inactivo'}</Etiqueta>
          {user.is_locked && <Etiqueta tone="aviso">Bloqueado</Etiqueta>}
        </div>
      ),
    },
    {
      id: 'lastLogin',
      header: 'Último acceso',
      noWrap: true,
      cell: (user) => (user.last_login === null ? 'Nunca' : formatDateTime(user.last_login)),
    },
    {
      id: 'actions',
      header: 'Acciones',
      align: 'right',
      cell: (user) => (
        <div className="flex items-center justify-end gap-2">
          <Boton size="icono" onClick={() => onEdit(user)} aria-label={`Editar a ${user.full_name}`} title="Editar">
            <Pencil className="size-4" aria-hidden="true" />
          </Boton>
          <Boton size="icono" onClick={() => onBranches(user)} aria-label={`Sucursales de ${user.full_name}`} title="Sucursales">
            <Building2 className="size-4" aria-hidden="true" />
          </Boton>
          <Boton size="icono" onClick={() => onPassword(user)} aria-label={`Contraseña de ${user.full_name}`} title="Cambiar contraseña">
            <KeyRound className="size-4" aria-hidden="true" />
          </Boton>
          {user.is_locked && (
            <Boton size="icono" onClick={() => onUnlock(user)} aria-label={`Desbloquear a ${user.full_name}`} title="Desbloquear cuenta">
              <LockOpen className="size-4" aria-hidden="true" />
            </Boton>
          )}
          {user.id !== currentUserId && (
            <Boton
              size="sm"
              variant={user.is_active ? 'peligro' : 'secundario'}
              onClick={() => onToggleActive(user)}
              aria-label={`${user.is_active ? 'Desactivar' : 'Activar'} a ${user.full_name}`}
            >
              {user.is_active ? 'Desactivar' : 'Activar'}
            </Boton>
          )}
        </div>
      ),
    },
  ];

  return <Tabla label="Lista de usuarios" columns={columns} rows={users} rowKey={(user) => user.id} />;
}
