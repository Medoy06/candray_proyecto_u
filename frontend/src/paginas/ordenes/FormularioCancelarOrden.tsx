// =============================================================================
// FormularioCancelarOrden.tsx
// Qué hace:     la ventana para cancelar una orden de óptica: muestra de quién es
//               y pide el motivo de la cancelación (obligatorio).
// Depende de:   componentes/ui, configuracion/negocio.ts y servicios/ordenesOptica.ts.
// Lo usa:       paginas/ordenes/PaginaOrdenesOptica.tsx.
//
// Cancelar no se puede deshacer: por eso el botón va en estilo de peligro y el
// foco inicial queda en el campo del motivo, no en el botón. A diferencia de las
// citas, aquí el motivo es obligatorio: queda en la historia de la orden.
// =============================================================================
import { useState, type FormEvent } from 'react';
import { Boton } from '../../componentes/ui/Boton';
import { FormField, inputClass } from '../../componentes/ui/FormField';
import { ModalShell } from '../../componentes/ui/ModalShell';
import { OPTICAL_ORDER_LIMITS } from '../../configuracion/negocio';
import { changeOpticalOrderStatus, type OpticalOrder, type OpticalOrderDetail } from '../../servicios/ordenesOptica';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { formatMoney } from '../../utilidades/formatoMoneda';

interface FormularioCancelarOrdenProps {
  order: OpticalOrder;
  onClose: () => void;
  onCancelled: (order: OpticalOrderDetail) => void;
}

export function FormularioCancelarOrden({ order, onClose, onCancelled }: FormularioCancelarOrdenProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = reason.trim();
    if (text === '') {
      setError('Indique el motivo de la cancelación.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      onCancelled(await changeOpticalOrderStatus(order.id, 'cancelled', text));
    } catch (cancelError: unknown) {
      setError(getApiErrorMessage(cancelError, 'No se pudo cancelar la orden.'));
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Cancelar orden"
      onClose={onClose}
      closeOnBackdrop={false}
      error={error}
      footer={
        <>
          <Boton variant="secundario" onClick={onClose}>
            Volver
          </Boton>
          <Boton variant="peligro" type="submit" form="formulario-cancelar-orden" disabled={saving}>
            {saving ? 'Cancelando...' : 'Cancelar orden'}
          </Boton>
        </>
      }
    >
      <form id="formulario-cancelar-orden" onSubmit={handleSubmit} noValidate autoComplete="off" className="space-y-4">
        <p className="text-sm text-texto">
          Orden de <strong>{order.patient_name}</strong>: {order.frame_description}, por {formatMoney(order.total_amount)}.
          Una orden cancelada no se puede reabrir.
        </p>
        <FormField label="Motivo de la cancelación" required>
          <textarea
            className={inputClass}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={OPTICAL_ORDER_LIMITS.reasonMaxLength}
            data-autofocus
          />
        </FormField>
      </form>
    </ModalShell>
  );
}
