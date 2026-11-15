// =============================================================================
// FormularioCrearUsuario.tsx
// Qué hace:     la ventana para crear un usuario: datos, rol, contraseña inicial
//               y sucursales. Valida en pantalla y luego deja que el servidor
//               tenga la última palabra (correo repetido, rol sin sucursal...).
// Depende de:   componentes/ui, servicios/usuarios.ts, servicios/sucursales.ts
//               y paginas/usuarios/SelectorSucursales.tsx.
// Lo usa:       paginas/usuarios/PaginaUsuarios.tsx.
//
// Administradores y directivos ven todas las sucursales, por eso para esos roles
// no se piden sucursales (se envía una lista vacía).
// =============================================================================
import { useEffect, useState, type FormEvent } from 'react';
import { Boton } from '../../componentes/ui/Boton';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { FormSection } from '../../componentes/ui/FormSection';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { MIN_PASSWORD_LENGTH } from '../../configuracion/negocio';
import { ROLES, ROLE_LABELS, seesAllBranches, type Role } from '../../configuracion/roles';
import { listBranches, type ManagedBranch } from '../../servicios/sucursales';
import { createUser, type ManagedUser } from '../../servicios/usuarios';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { SelectorSucursales } from './SelectorSucursales';
import { EMPTY_SELECTION, type BranchSelection } from './seleccionSucursales';

interface FormularioCrearUsuarioProps {
  onClose: () => void;
  onCreated: (user: ManagedUser) => void;
}

export function FormularioCrearUsuario({ onClose, onCreated }: FormularioCrearUsuarioProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('recepcionista');
  const [selection, setSelection] = useState<BranchSelection>(EMPTY_SELECTION);
  const [branches, setBranches] = useState<ManagedBranch[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Se cargan las sucursales activas una sola vez, al abrir la ventana.
  useEffect(() => {
    let cancelled = false;
    listBranches()
      .then((all) => {
        if (!cancelled) setBranches(all.filter((branch) => branch.is_active));
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(getApiErrorMessage(loadError, 'No se pudieron cargar las sucursales.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const needsBranches = !seesAllBranches(role);

  // Devuelve el primer problema que encuentre, o '' si todo está bien.
  function validate(): string {
    if (fullName.trim().length < 2) return 'Escriba el nombre completo (mínimo 2 caracteres).';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Escriba un correo válido.';
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    }
    if (needsBranches && selection.ids.length === 0) return 'Este rol necesita al menos una sucursal asignada.';
    return '';
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validate();
    if (problem !== '') {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await createUser({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        role,
        branch_ids: needsBranches ? selection.ids : [],
        ...(needsBranches && selection.defaultId !== null ? { default_branch_id: selection.defaultId } : {}),
      });
      onCreated(created);
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, 'No se pudo crear el usuario.'));
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Nuevo usuario"
      onClose={onClose}
      closeOnBackdrop={false}
      size="2xl"
      error={error}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton variant="primario" type="submit" form="formulario-crear-usuario" disabled={saving}>
            {saving ? 'Creando...' : 'Crear usuario'}
          </Boton>
        </>
      }
    >
      <form id="formulario-crear-usuario" onSubmit={handleSubmit} noValidate autoComplete="off">
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
          <FormField label="Correo" required>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </FormField>
          <FormField label="Contraseña inicial" required hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`}>
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </FormField>
          <FormField label="Rol" required>
            <select className={inputClass} value={role} onChange={(event) => setRole(event.target.value as Role)}>
              {ROLES.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </select>
          </FormField>
        </FormSection>
        <FormSection
          title="Sucursales"
          description={needsBranches ? undefined : 'Este rol ve todas las sucursales; no hace falta asignarlas.'}
        >
          {needsBranches && <SelectorSucursales branches={branches} value={selection} onChange={setSelection} />}
        </FormSection>
      </form>
    </ModalShell>
  );
}
