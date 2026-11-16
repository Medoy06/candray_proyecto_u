// =============================================================================
// formularioOrden.ts
// Qué hace:     la lógica del formulario de una orden de óptica, sin React:
//               los valores iniciales, la validación y el armado de lo que se
//               envía al servidor.
// Depende de:   configuracion/negocio.ts y servicios/ordenesOptica.ts.
// Lo usan:      paginas/ordenes/FormularioOrden.tsx y sus pruebas.
//
// Los campos se escriben como texto (así los entrega el formulario) y aquí se
// convierten. La validación devuelve el PRIMER problema como mensaje, o '' si
// todo está bien. Las reglas son las mismas del backend (esquemas/ordenesOptica.ts),
// que de todos modos vuelve a comprobarlas. El dinero se compara en centavos
// enteros para evitar errores de decimales.
// =============================================================================
import { OPTICAL_ORDER_LIMITS as LIMITS } from '../../configuracion/negocio';
import type { CreateOpticalOrderInput } from '../../servicios/ordenesOptica';

export interface OrderFormValues {
  frame: string;
  lenses: string;
  total: string;
  deposit: string;
  notes: string;
}

export const EMPTY_ORDER_FORM: OrderFormValues = { frame: '', lenses: '', total: '', deposit: '', notes: '' };

// Un monto escrito por la persona: acepta coma ("12,50"), ".5" y "10." pero no más de
// dos decimales. Devuelve null si está vacío y NaN si no es un monto válido.
export function parseAmount(text: string): number | null {
  const clean = text.trim().replace(',', '.');
  if (clean === '') return null;
  if (!/^(\d+\.?\d{0,2}|\.\d{1,2})$/.test(clean)) return NaN;
  return Number(clean);
}

const toCents = (amount: number): number => Math.round(amount * 100);

// Devuelve el primer problema del formulario, o '' si se puede enviar.
export function validateOrderForm(values: OrderFormValues): string {
  if (values.frame.trim() === '') return 'Indique el armazón.';
  if (values.frame.trim().length > LIMITS.descriptionMaxLength) {
    return `El armazón admite hasta ${LIMITS.descriptionMaxLength} caracteres.`;
  }
  if (values.lenses.trim() === '') return 'Indique los lentes.';
  if (values.lenses.trim().length > LIMITS.descriptionMaxLength) {
    return `Los lentes admiten hasta ${LIMITS.descriptionMaxLength} caracteres.`;
  }

  const total = parseAmount(values.total);
  if (total === null) return 'Indique el total de la orden.';
  if (Number.isNaN(total)) return 'El total debe ser un monto en dólares, con a lo más dos decimales.';
  if (toCents(total) <= 0) return 'El total debe ser mayor que cero.';
  if (total > LIMITS.maxAmount) return `El total no puede pasar de ${LIMITS.maxAmount}.`;

  const deposit = parseAmount(values.deposit);
  if (deposit !== null) {
    if (Number.isNaN(deposit)) return 'El anticipo debe ser un monto en dólares, con a lo más dos decimales.';
    if (toCents(deposit) > toCents(total)) return 'El anticipo no puede pasar del total.';
  }

  if (values.notes.trim().length > LIMITS.notesMaxLength) {
    return `Las notas admiten hasta ${LIMITS.notesMaxLength} caracteres.`;
  }
  return '';
}

// Arma lo que se envía. Solo se llama con un formulario ya validado.
// Un anticipo vacío es 0 y unas notas en blanco son "sin notas" (null).
export function buildOrderInput(prescriptionId: string, values: OrderFormValues): CreateOpticalOrderInput {
  const notes = values.notes.trim();
  return {
    prescription_id: prescriptionId,
    frame_description: values.frame.trim(),
    lens_description: values.lenses.trim(),
    total_amount: parseAmount(values.total) as number,
    deposit_amount: parseAmount(values.deposit) ?? 0,
    notes: notes === '' ? null : notes,
  };
}
