// =============================================================================
// etiquetasAuditoria.ts
// Qué hace:     convierte los códigos de la bitácora (user_created, login_failed,
//               {"role":{"from":...}}) en texto legible en español.
// Depende de:   configuracion/roles.ts.
// Lo usa:       paginas/auditoria/TablaAuditoria.tsx y FiltrosAuditoria.tsx.
//
// Sin React, para poder probarlo solo. Si aparece un código que no conocemos
// (una acción nueva del backend), se muestra tal cual: nunca se oculta nada.
// =============================================================================
import { ROLE_LABELS, type Role } from '../../configuracion/roles';

const ACTION_LABELS: Record<string, string> = {
  login_success: 'Inicio de sesión',
  login_failed: 'Inicio de sesión fallido',
  account_locked: 'Cuenta bloqueada',
  login_rate_limited: 'Demasiados intentos de acceso',
  user_created: 'Usuario creado',
  user_updated: 'Usuario modificado',
  user_branches_updated: 'Sucursales del usuario cambiadas',
  user_unlocked: 'Cuenta desbloqueada',
  user_password_reset: 'Contraseña restablecida',
  branch_created: 'Sucursal creada',
  branch_updated: 'Sucursal modificada',
  record_viewed: 'Expediente consultado',
  record_printed: 'Expediente impreso',
  record_access_denied: 'Acceso al expediente denegado',
  record_created: 'Nota de expediente escrita',
  record_amended: 'Nota de expediente enmendada',
  referral_granted: 'Interconsulta otorgada',
  referral_revoked: 'Interconsulta revocada',
  consent_granted: 'Consentimiento registrado',
  consent_revoked: 'Consentimiento revocado',
  prescription_issued: 'Receta emitida',
  prescription_replaced: 'Receta reemplazada',
  prescription_viewed: 'Receta consultada',
  prescription_access_denied: 'Acceso a la receta denegado',
  optical_order_created: 'Orden de óptica creada',
  optical_order_status_changed: 'Orden de óptica cambió de estado',
  optical_order_denied: 'Orden de óptica denegada',
};

const ENTITY_LABELS: Record<string, string> = {
  auth: 'Acceso',
  user: 'Usuario',
  branch: 'Sucursal',
  patient: 'Paciente',
  medical_record: 'Expediente',
  referral: 'Interconsulta',
  consent: 'Consentimiento',
  prescription: 'Receta',
  optical_order: 'Orden de óptica',
};

// Nombre de cada dato del detalle. Los datos que no aparecen aquí y son
// identificadores internos se omiten (ver HIDDEN_KEYS).
const KEY_LABELS: Record<string, string> = {
  email: 'Correo',
  reason: 'Motivo',
  ip: 'IP',
  attempts: 'Intentos',
  lock_minutes: 'Minutos de bloqueo',
  limit: 'Límite',
  window_minutes: 'Ventana (min)',
  code: 'Código',
  name: 'Nombre',
  full_name: 'Nombre',
  role: 'Rol',
  is_active: 'Activo',
  branch_ids: 'Sucursales',
  address: 'Dirección',
  phone: 'Teléfono',
  opening_time: 'Apertura',
  closing_time: 'Cierre',
  theme_color: 'Color',
  has_optical_counter: 'Mostrador de óptica',
  access: 'Acceso',
  expires_at: 'Vence',
  from: 'Antes',
  to: 'Después',
};

const ORDER_STATUS_VALUES: Record<string, string> = {
  pending: 'Pendiente',
  in_lab: 'En taller',
  ready: 'Lista',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
};

// Valores de la bitácora que son códigos y se leen mejor traducidos.
const VALUE_LABELS: Record<string, Record<string, string>> = {
  access: { role: 'Por su rol', appointment: 'Por una cita', referral: 'Por interconsulta', consent: 'Por consentimiento' },
  reason: {
    no_relation: 'Sin cita ni interconsulta',
    check_failed: 'Falló la verificación',
    no_consent: 'Sin consentimiento del paciente',
  },
  // El estado de una orden de óptica, antes y después de un cambio.
  from: ORDER_STATUS_VALUES,
  to: ORDER_STATUS_VALUES,
};

// Identificadores internos: no le dicen nada a quien lee la bitácora.
const HIDDEN_KEYS = new Set([
  'account_id',
  'default_branch_id',
  'patient_id',
  'provider_id',
  'appointment_id',
  'amends_id',
  'record_id',
  'supersedes_id',
  'prescription_id',
]);

// Los textos largos se cortan para que una fila no ocupe media pantalla.
const MAX_VALUE_LENGTH = 60;

export const actionLabel = (action: string): string => ACTION_LABELS[action] ?? action;
export const entityLabel = (entityType: string): string => ENTITY_LABELS[entityType] ?? entityType;

function isFromTo(value: unknown): value is { from: unknown; to: unknown } {
  return typeof value === 'object' && value !== null && 'from' in value && 'to' in value;
}

// Un valor suelto, como lo leería una persona.
function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) return value.length === 1 ? '1 elemento' : `${value.length} elementos`;
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const translated = VALUE_LABELS[key]?.[text];
  if (translated !== undefined) return translated;
  const shown = key === 'role' && text in ROLE_LABELS ? ROLE_LABELS[text as Role] : text;
  return shown.length > MAX_VALUE_LENGTH ? `${shown.slice(0, MAX_VALUE_LENGTH)}…` : shown;
}

// El detalle de una entrada como una lista de líneas, ej.: ["Rol: Doctor → Recepcionista"].
// Un dato con { from, to } se muestra como "antes → después".
export function summarizeDetail(detail: Record<string, unknown> | null): string[] {
  if (detail === null) return [];
  const lines: string[] = [];
  for (const [key, value] of Object.entries(detail)) {
    if (HIDDEN_KEYS.has(key) || value === undefined) continue;
    const label = KEY_LABELS[key] ?? key;
    const text = isFromTo(value)
      ? `${formatValue(key, value.from)} → ${formatValue(key, value.to)}`
      : formatValue(key, value);
    lines.push(`${label}: ${text}`);
  }
  return lines;
}
