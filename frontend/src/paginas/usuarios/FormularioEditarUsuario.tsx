// =============================================================================
// FormularioEditarUsuario.tsx
// Qué hace:     la ventana para editar el nombre y el rol de un usuario. El
//               correo se muestra pero no se cambia. Solo se envía lo que cambió.
// Depende de:   componentes/ui, servicios/usuarios.ts y configuracion/roles.ts.
// Lo usa:       paginas/usuarios/PaginaUsuarios.tsx.
//
// Activar/desactivar NO está aquí: es una acción deliberada de la tabla con su
// propia confirmación. Las sucursales, la contraseña y el desbloqueo llegan en 5c-2.
// Nadie puede cambiar su propio rol (el servidor tampoco lo permite).
// =============================================================================
import { useState, type FormEvent } from 'react';
import { Boton } from '../../componentes/ui/Boton';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { FormSection } from '../../componentes/ui/FormSection';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { ROLES, ROLE_LABELS, type Role } from '../../configuracion/roles';
import { updateUser, type ManagedUser, type UpdateUserInput } from '../../servicios/usuarios';
import { getApiErrorMessage } from '../../utilidades/errorApi';

interface FormularioEditarUsuarioProps {
  user: ManagedUser;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (user: ManagedUser) => void;
}

export function FormularioEditarUsuario({ user, isSelf, onClose, onSaved }: FormularioEditarUsuarioProps) {
  const [fullName, setFullName] = useState(user.full_name);
  const [role, setRole] = useState<Role>(user.role);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (fullName.trim().length < 2) {
      setError('Escriba el nombre completo (mínimo 2 caracteres).');
      return;
    }
    // Solo se envían los campos que cambiaron.
    const changes: UpdateUserInput = {};
    if (fullName.trim() !== user.full_name) changes.full_name = fullName.trim();
    if (role !== user.role) changes.role = role;
    if (Object.keys(changes).length === 0) {
      setError('No hay cambios que guardar.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      onSaved(await updateUser(user.id, changes));
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, 'No se pudieron guardar los cambios.'));
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Editar usuario"
      onClose={onClose}
      closeOnBackdrop={false}
      error={error}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton variant="primario" type="submit" form="formulario-editar-usuario" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Boton>
        </>
      }
    >
      <form id="formulario-editar-usuario" onSubmit={handleSubmit} noValidate>
        <FormSection title="Datos de la cuenta">
          <FormField label="Nombre completo" required className="sm:col-span-2">
            <input
              className={inputClass}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              data-autofocus
              required
            />
          </FormField>
          <FormField label="Correo" className="sm:col-span-2" hint="El correo no se puede cambiar.">
            <input className={inputClass} value={user.email} disabled readOnly />
          </FormField>
          <FormField
            label="Rol"
            className="sm:col-span-2"
            hint={isSelf ? 'No puede cambiar su propio rol.' : undefined}
          >
            <select
              className={inputClass}
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
              disabled={isSelf}
            >
              {ROLES.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </select>
          </FormField>
        </FormSection>
      </form>
    </ModalShell>
  );
}
