// =============================================================================
// roles.ts (configuración del frontend)
// Qué hace:     lista de roles del sistema y cómo se llaman en pantalla.
// Lo usan:      el tipo de usuario de la sesión, la barra lateral y el login.
//
// Es la misma lista que backend/src/configuracion/roles.ts y que el tipo
// user_role de la base de datos. verificar_roles.sh (paso 6) compara las tres.
// =============================================================================
export const ROLES = ['admin', 'doctor', 'recepcionista', 'encargado_venta', 'directivo'] as const;

export type Role = (typeof ROLES)[number];

// Nombre de cada rol tal como lo ve el usuario.
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  doctor: 'Médico',
  recepcionista: 'Recepción',
  encargado_venta: 'Óptica (ventas)',
  directivo: 'Directivo',
};
