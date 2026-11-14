// =============================================================================
// capacidades.ts (configuración del frontend)
// Qué hace:     los NOMBRES de las capacidades que el backend puede publicar
//               (lo que un usuario puede hacer). Sirve para que escribir mal un
//               nombre en el menú sea un error de compilación.
// Lo usan:      sesión (can) y el mapa de rutas.
//
// Aquí solo están los nombres, NO quién tiene cada una: eso lo decide el
// backend y llega en el inicio de sesión (campo "capabilities"). Así no hay una
// segunda copia de los permisos que pueda quedar desactualizada.
// Misma lista que CAPABILITIES en backend/src/configuracion/permisos.ts.
// =============================================================================
export const CAPABILITIES = [
  'appointments_read',
  'availability_read',
  'appointments_manage',
  'schedules_manage',
  'patients_search',
  'patients_manage',
  'medical_records_read',
  'medical_records_author',
  'medical_records_output',
  'referrals_manage',
  'prescriptions_author',
  'prescriptions_read',
  'consents_manage',
  'consents_read',
  'optical_orders_manage',
  'optical_orders_read',
  'reminders_read',
  'users_manage',
  'branches_manage',
  'audit_read',
  'dashboard_read',
] as const;

export type Capability = (typeof CAPABILITIES)[number];
