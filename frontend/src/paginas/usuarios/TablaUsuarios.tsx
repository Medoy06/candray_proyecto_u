// =============================================================================
// TablaUsuarios.tsx
// Qué hace:     la tabla de usuarios: nombre y correo, rol, sucursales, estado,
//               último acceso y las acciones de cada fila.
// Depende de:   componentes/ui (Boton, Etiqueta), configuracion/roles.ts y
//               utilidades/formatoFecha.ts.
// Lo usa:       paginas/usuarios/PaginaUsuarios.tsx.
//
// No decide nada: avisa a la página cuando se pulsa una acción. En su PROPIA
// fila no se ofrece desactivar (el backend tampoco lo permite). "Desbloquear"
// solo aparece en cuentas bloqueadas. Las acciones de edición son botones de
// icono (con título al pasar el cursor y nombre accesible); activar/desactivar
// lleva texto porque cambia el estado y tiene color propio.
// El contenedor con overflow-x-auto evita que la tabla se corte en silencio en
// ventanas angostas (lección del ítem 80 de Hospital Mio).
// =============================================================================
import { Building2, KeyRound, LockOpen, Pencil } from 'lucide-react';
import { Boton } from '../../componentes/ui/Boton';
import { Etiqueta } from '../../componentes/ui/Etiqueta';
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

export function TablaUsuarios({ users, currentUserId, onEdit, onBranches, onPassword, onUnlock, onToggleActive }: TablaUsuariosProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-borde bg-superficie">
      <table className="w-full text-left text-sm">
        <thead className="bg-apoyo text-xs text-texto-suave">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">Usuario</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Rol</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Sucursales</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Estado</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Último acceso</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            return (
              <tr key={user.id}>
                <td className="px-4 py-3">
                  <p className="flex flex-wrap items-center gap-x-2 font-medium text-texto">
                    {user.full_name}
                    {isSelf && <span className="text-xs font-normal text-texto-suave">(usted)</span>}
                  </p>
                  <p className="text-xs text-texto-suave">{user.email}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3">{ROLE_LABELS[user.role]}</td>
                <td className="px-4 py-3">{branchesText(user)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <Etiqueta tone={user.is_active ? 'exito' : 'neutro'}>{user.is_active ? 'Activo' : 'Inactivo'}</Etiqueta>
                    {user.is_locked && <Etiqueta tone="aviso">Bloqueado</Etiqueta>}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">{user.last_login === null ? 'Nunca' : formatDateTime(user.last_login)}</td>
                <td className="px-4 py-3">
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
                    {!isSelf && (
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
