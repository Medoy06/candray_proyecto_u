// =============================================================================
// formularioSucursal.ts
// Qué hace:     la lógica (sin pantalla) del formulario de sucursales: los
//               valores iniciales, la validación y cómo se arma lo que se envía
//               al servidor al crear y al editar.
// Depende de:   servicios/sucursales.ts y tema/aplicarTema.ts.
// Lo usa:       paginas/sucursales/FormularioSucursal.tsx.
//
// Las reglas son las mismas que valida el backend (esquemas/sucursales.ts):
// avisar aquí ahorra un viaje al servidor, pero el servidor tiene la última palabra.
// =============================================================================
import type { CreateBranchInput, ManagedBranch, UpdateBranchInput } from '../../servicios/sucursales';
import { DEFAULT_ACCENT } from '../../tema/aplicarTema';

// Todo en texto, tal como lo escribe la persona; se convierte al enviar.
export interface BranchFormValues {
  code: string;
  name: string;
  address: string;
  phone: string;
  opening_time: string; // "HH:MM"
  closing_time: string; // "HH:MM"
  theme_color: string; // "#rrggbb"
  has_optical_counter: boolean;
}

export const EMPTY_BRANCH_FORM: BranchFormValues = {
  code: '',
  name: '',
  address: '',
  phone: '',
  opening_time: '08:00',
  closing_time: '18:00',
  theme_color: DEFAULT_ACCENT,
  has_optical_counter: false,
};

const CODE_PATTERN = /^[A-Z0-9_]{2,20}$/;

// Teléfono: hasta 20 caracteres (el servidor admite 30, pero un número real no
// los necesita) y solo lo que lleva un teléfono: dígitos, espacios, + - ( ) y punto.
export const PHONE_MAX_LENGTH = 20;
const PHONE_PATTERN = /^[0-9+()\-\s.]*$/;
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// La base entrega "08:00:00"; el formulario trabaja con "08:00".
const toHourMinute = (time: string): string => time.slice(0, 5);

// Los valores del formulario al editar una sucursal que ya existe.
export function formFromBranch(branch: ManagedBranch): BranchFormValues {
  return {
    code: branch.code,
    name: branch.name,
    address: branch.address ?? '',
    phone: branch.phone ?? '',
    opening_time: toHourMinute(branch.opening_time),
    closing_time: toHourMinute(branch.closing_time),
    theme_color: branch.theme_color,
    has_optical_counter: branch.has_optical_counter,
  };
}

// Devuelve el primer problema que encuentre, o '' si todo está bien.
// En modo "edit" no se revisa el código: no se puede cambiar.
export function validateBranchForm(values: BranchFormValues, mode: 'create' | 'edit'): string {
  if (mode === 'create' && !CODE_PATTERN.test(values.code)) {
    return 'El código usa solo MAYÚSCULAS, números y guion bajo (2 a 20 caracteres).';
  }
  if (values.name.trim().length < 2) return 'Escriba el nombre de la sucursal (mínimo 2 caracteres).';
  if (values.address.trim().length > 500) return 'La dirección es demasiado larga (máximo 500 caracteres).';
  if (values.phone.trim().length > PHONE_MAX_LENGTH) {
    return `El teléfono es demasiado largo (máximo ${PHONE_MAX_LENGTH} caracteres).`;
  }
  if (!PHONE_PATTERN.test(values.phone)) return 'El teléfono solo puede llevar números, espacios y los signos + - ( ).';
  if (!TIME_PATTERN.test(values.opening_time) || !TIME_PATTERN.test(values.closing_time)) {
    return 'Indique la hora de apertura y la de cierre.';
  }
  if (values.opening_time >= values.closing_time) return 'La hora de apertura debe ser anterior a la de cierre.';
  if (!COLOR_PATTERN.test(values.theme_color)) return 'Elija un color válido.';
  return '';
}

// Texto vacío = sin dato (null), como espera el servidor.
const textOrNull = (text: string): string | null => (text.trim() === '' ? null : text.trim());

// Lo que se envía al crear.
export function buildCreateInput(values: BranchFormValues): CreateBranchInput {
  return {
    code: values.code,
    name: values.name.trim(),
    address: textOrNull(values.address),
    phone: textOrNull(values.phone),
    opening_time: values.opening_time,
    closing_time: values.closing_time,
    theme_color: values.theme_color,
    has_optical_counter: values.has_optical_counter,
  };
}

// Lo que se envía al editar: SOLO los campos que cambiaron respecto de la sucursal.
// El color se compara sin distinguir mayúsculas ("#00AA11" y "#00aa11" son el mismo).
export function buildBranchChanges(branch: ManagedBranch, values: BranchFormValues): UpdateBranchInput {
  const changes: UpdateBranchInput = {};
  if (values.name.trim() !== branch.name) changes.name = values.name.trim();
  if (textOrNull(values.address) !== branch.address) changes.address = textOrNull(values.address);
  if (textOrNull(values.phone) !== branch.phone) changes.phone = textOrNull(values.phone);
  if (values.opening_time !== toHourMinute(branch.opening_time)) changes.opening_time = values.opening_time;
  if (values.closing_time !== toHourMinute(branch.closing_time)) changes.closing_time = values.closing_time;
  if (values.theme_color.toLowerCase() !== branch.theme_color.toLowerCase()) changes.theme_color = values.theme_color;
  if (values.has_optical_counter !== branch.has_optical_counter) {
    changes.has_optical_counter = values.has_optical_counter;
  }
  return changes;
}
