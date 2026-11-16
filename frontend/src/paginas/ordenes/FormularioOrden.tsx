// =============================================================================
// FormularioOrden.tsx
// Qué hace:     la ventana para crear una orden de óptica: se elige el paciente,
//               se elige su receta vigente y se escribe el pedido (armazón,
//               lentes, total, anticipo y notas).
// Depende de:   componentes/ui, paginas/citas/SelectorPaciente.tsx,
//               paginas/ordenes/SelectorRecetaOrden.tsx, formularioOrden.ts y
//               servicios/ordenesOptica.ts.
// Lo usa:       paginas/ordenes/PaginaOrdenesOptica.tsx.
//
// Valida en pantalla antes de enviar (el servidor vuelve a validar). La sucursal
// y quién registra la orden no se escriben: las pone el servidor. Si el paciente
// no tiene consentimiento, el servidor lo dice al pedir la receta y no se puede
// continuar. Al cambiar de paciente se olvida la receta elegida.
// =============================================================================
import { useState, type FormEvent } from 'react';
import { Boton } from '../../componentes/ui/Boton';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { OPTICAL_ORDER_LIMITS } from '../../configuracion/negocio';
import { createOpticalOrder, type OpticalOrderDetail } from '../../servicios/ordenesOptica';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { SelectorPaciente, type PatientChoice } from '../citas/SelectorPaciente';
import { buildOrderInput, EMPTY_ORDER_FORM, validateOrderForm, type OrderFormValues } from './formularioOrden';
import { SelectorRecetaOrden } from './SelectorRecetaOrden';

interface FormularioOrdenProps {
  onClose: () => void;
  onSaved: (order: OpticalOrderDetail) => void;
}

export function FormularioOrden({ onClose, onSaved }: FormularioOrdenProps) {
  const [patient, setPatient] = useState<PatientChoice | null>(null);
  const [prescriptionId, setPrescriptionId] = useState('');
  const [values, setValues] = useState<OrderFormValues>(EMPTY_ORDER_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field: keyof OrderFormValues) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  function choosePatient(next: PatientChoice | null) {
    setPatient(next);
    setPrescriptionId('');
    setError('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (patient === null) return setError('Elija el paciente.');
    if (prescriptionId === '') return setError('Elija la receta de la orden.');
    const problem = validateOrderForm(values);
    if (problem !== '') return setError(problem);

    setSaving(true);
    setError('');
    try {
      onSaved(await createOpticalOrder(buildOrderInput(prescriptionId, values)));
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, 'No se pudo crear la orden.'));
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Nueva orden de óptica"
      size="2xl"
      onClose={onClose}
      closeOnBackdrop={false}
      error={error}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton variant="primario" type="submit" form="formulario-orden" disabled={saving}>
            {saving ? 'Guardando...' : 'Crear orden'}
          </Boton>
        </>
      }
    >
      <form id="formulario-orden" onSubmit={handleSubmit} noValidate autoComplete="off" className="space-y-4">
        <SelectorPaciente value={patient} onChange={choosePatient} />

        {patient !== null && (
          <SelectorRecetaOrden patientId={patient.id} value={prescriptionId} onChange={setPrescriptionId} />
        )}

        {prescriptionId !== '' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Armazón" required className="sm:col-span-2">
              <input
                className={inputClass}
                value={values.frame}
                onChange={set('frame')}
                maxLength={OPTICAL_ORDER_LIMITS.descriptionMaxLength}
                placeholder="Ej.: Armazón metálico negro"
              />
            </FormField>
            <FormField label="Lentes" required className="sm:col-span-2">
              <input
                className={inputClass}
                value={values.lenses}
                onChange={set('lenses')}
                maxLength={OPTICAL_ORDER_LIMITS.descriptionMaxLength}
                placeholder="Ej.: Progresivos con antirreflejo"
              />
            </FormField>
            <FormField label="Total (US$)" required>
              <input className={inputClass} inputMode="decimal" value={values.total} onChange={set('total')} />
            </FormField>
            <FormField label="Anticipo (US$)" hint="Opcional.">
              <input className={inputClass} inputMode="decimal" value={values.deposit} onChange={set('deposit')} />
            </FormField>
            <FormField label="Notas" hint="Opcional." className="sm:col-span-2">
              <textarea
                className={inputClass}
                rows={2}
                value={values.notes}
                onChange={set('notes')}
                maxLength={OPTICAL_ORDER_LIMITS.notesMaxLength}
              />
            </FormField>
          </div>
        )}
      </form>
    </ModalShell>
  );
}
