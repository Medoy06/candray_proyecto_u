// =============================================================================
// FormularioContrasenaUsuario.tsx
// Qué hace:     la ventana para asignarle una contraseña nueva a un usuario
//               (por ejemplo, si la olvidó). Pide la contraseña dos veces.
// Depende de:   componentes/ui, servicios/usuarios.ts y configuracion/negocio.ts.
// Lo usa:       paginas/usuarios/PaginaUsuarios.tsx.
//
// Efectos en el servidor: cambia la contraseña y también levanta el bloqueo de la
// cuenta. La contraseña no queda en la auditoría, solo el hecho de que cambió.
// =============================================================================
import { useState, type FormEvent } from 'react';
import { Boton } from '../../componentes/ui/Boton';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { MIN_PASSWORD_LENGTH } from '../../configuracion/negocio';
import { resetUserPassword, type ManagedUser } from '../../servicios/usuarios';
import { getApiErrorMessage } from '../../utilidades/errorApi';

interface FormularioContrasenaUsuarioProps {
  user: ManagedUser;
  onClose: () => void;
  onSaved: () => void;
}

export function FormularioContrasenaUsuario({ user, onClose, onSaved }: FormularioContrasenaUsuarioProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await resetUserPassword(user.id, password);
      onSaved();
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, 'No se pudo cambiar la contraseña.'));
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Nueva contraseña"
      onClose={onClose}
      closeOnBackdrop={false}
      error={error}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton variant="primario" type="submit" form="formulario-contrasena-usuario" disabled={saving}>
            {saving ? 'Guardando...' : 'Cambiar contraseña'}
          </Boton>
        </>
      }
    >
      <form id="formulario-contrasena-usuario" onSubmit={handleSubmit} noValidate autoComplete="off">
        <p className="mb-4 text-sm text-texto">
          Contraseña nueva para <span className="font-medium">{user.full_name}</span>. Comuníquesela por un medio
          seguro. Si la cuenta estaba bloqueada, también se desbloquea.
        </p>
        <div className="grid gap-4">
          <FormField label="Contraseña nueva" required hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`}>
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              data-autofocus
              required
            />
          </FormField>
          <FormField label="Repetir contraseña" required>
            <input
              type="password"
              className={inputClass}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              required
            />
          </FormField>
        </div>
      </form>
    </ModalShell>
  );
}
