// =============================================================================
// FormularioSucursal.tsx
// Qué hace:     la ventana para crear una sucursal o editar una existente. Es
//               la misma ventana: al editar, el código aparece bloqueado y solo
//               se envía lo que cambió.
// Depende de:   componentes/ui, servicios/sucursales.ts y
//               paginas/sucursales/formularioSucursal.ts (validación y cuerpos).
// Lo usa:       paginas/sucursales/PaginaSucursales.tsx.
//
// El color es solo decorativo: se ve como una franja bajo el encabezado y un
// punto junto al nombre de la sucursal, nunca como color de texto.
// =============================================================================
import { useState, type FormEvent } from 'react';
import { Boton } from '../../componentes/ui/Boton';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { FormSection } from '../../componentes/ui/FormSection';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { createBranch, updateBranch, type ManagedBranch } from '../../servicios/sucursales';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import {
  buildBranchChanges,
  buildCreateInput,
  EMPTY_BRANCH_FORM,
  formFromBranch,
  PHONE_MAX_LENGTH,
  validateBranchForm,
  type BranchFormValues,
} from './formularioSucursal';

interface FormularioSucursalProps {
  branch?: ManagedBranch; // si viene, se edita; si no, se crea
  onClose: () => void;
  onSaved: (branch: ManagedBranch) => void;
}

export function FormularioSucursal({ branch, onClose, onSaved }: FormularioSucursalProps) {
  const mode = branch === undefined ? 'create' : 'edit';
  const [values, setValues] = useState<BranchFormValues>(branch === undefined ? EMPTY_BRANCH_FORM : formFromBranch(branch));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Cambia un solo campo sin tocar los demás.
  const set = <K extends keyof BranchFormValues>(key: K, value: BranchFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validateBranchForm(values, mode);
    if (problem !== '') {
      setError(problem);
      return;
    }
    // Qué se pide al servidor: crear, o editar con SOLO lo que cambió.
    let request: () => Promise<ManagedBranch>;
    if (branch === undefined) {
      request = () => createBranch(buildCreateInput(values));
    } else {
      const changes = buildBranchChanges(branch, values);
      if (Object.keys(changes).length === 0) {
        setError('No hay cambios que guardar.');
        return;
      }
      request = () => updateBranch(branch.id, changes);
    }
    setSaving(true);
    setError('');
    try {
      onSaved(await request());
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, 'No se pudo guardar la sucursal.'));
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={mode === 'create' ? 'Nueva sucursal' : 'Editar sucursal'}
      onClose={onClose}
      closeOnBackdrop={false}
      size="2xl"
      error={error}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton variant="primario" type="submit" form="formulario-sucursal" disabled={saving}>
            {saving ? 'Guardando...' : mode === 'create' ? 'Crear sucursal' : 'Guardar cambios'}
          </Boton>
        </>
      }
    >
      <form id="formulario-sucursal" onSubmit={handleSubmit} noValidate autoComplete="off">
        <FormSection title="Datos de la sucursal">
          <FormField
            label="Código"
            required={mode === 'create'}
            hint={mode === 'create' ? 'Mayúsculas, números y guion bajo. No se podrá cambiar.' : 'El código no se puede cambiar.'}
          >
            <input
              className={inputClass}
              value={values.code}
              onChange={(event) => set('code', event.target.value.toUpperCase())}
              disabled={mode === 'edit'}
              maxLength={20}
              data-autofocus={mode === 'create' ? true : undefined}
              required
            />
          </FormField>
          <FormField label="Nombre" required>
            <input
              className={inputClass}
              value={values.name}
              onChange={(event) => set('name', event.target.value)}
              data-autofocus={mode === 'edit' ? true : undefined}
              required
            />
          </FormField>
          <FormField label="Dirección" className="sm:col-span-2">
            <input className={inputClass} value={values.address} onChange={(event) => set('address', event.target.value)} />
          </FormField>
          <FormField label="Teléfono">
            <input
              type="tel"
              maxLength={PHONE_MAX_LENGTH}
              className={inputClass}
              value={values.phone}
              onChange={(event) => set('phone', event.target.value)}
            />
          </FormField>
        </FormSection>
        <FormSection title="Horario y servicios" description="Un solo horario para toda la semana (por ahora).">
          <FormField label="Apertura" required>
            <input
              type="time"
              className={inputClass}
              value={values.opening_time}
              onChange={(event) => set('opening_time', event.target.value)}
              required
            />
          </FormField>
          <FormField label="Cierre" required>
            <input
              type="time"
              className={inputClass}
              value={values.closing_time}
              onChange={(event) => set('closing_time', event.target.value)}
              required
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-texto sm:col-span-2">
            <input
              type="checkbox"
              checked={values.has_optical_counter}
              onChange={(event) => set('has_optical_counter', event.target.checked)}
              className="size-4 accent-marca"
            />
            Tiene mostrador de óptica
          </label>
        </FormSection>
        <FormSection
          title="Color"
          description="Solo decorativo: la franja bajo el encabezado y el punto junto al nombre de la sucursal."
        >
          <FormField label="Color de la sucursal">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={values.theme_color}
                onChange={(event) => set('theme_color', event.target.value)}
                className="h-10 w-14 cursor-pointer rounded-md border border-borde-fuerte bg-superficie p-1"
              />
              <span className="font-mono text-sm text-texto-suave">{values.theme_color}</span>
            </div>
          </FormField>
        </FormSection>
      </form>
    </ModalShell>
  );
}
