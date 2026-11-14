// =============================================================================
// permisos.ts
// Qué hace:     define QUÉ puede hacer cada rol, como un mapa plano de
//               capacidad -> lista de roles. Hay dos perfiles; la ÚNICA
//               diferencia entre ellos es lo que puede hacer el administrador:
//                 - "demostracion": el administrador puede todo (para mostrar
//                   todas las funciones en la presentación).
//                 - "estricto": el administrador no accede a datos clínicos ni
//                   modifica citas (principio de mínimo privilegio, como sería
//                   en un uso real).
//               El perfil activo lo elige la variable PERFIL_PERMISOS.
// Requerimiento: sección 7 del documento de diseño (mapa de capacidades).
// Depende de:   roles.ts (solo el tipo Role).
// Lo usan:      el intermediario de autenticación (can) y las pruebas.
//
// Este archivo NO lee variables de entorno ni toca la base de datos: es
// información pura. Por eso se puede probar con los dos perfiles sin configurar
// nada. Quien decide qué perfil se aplica es el intermediario, que llama a
// buildPermissions(env.PERFIL_PERMISOS).
//
// Se mantiene un mapa plano a propósito: sin jerarquías, herencia ni comodines.
// Para cambiar un acceso se edita UNA lista aquí, sin buscar en las rutas.
//
// El frontend tiene su propia copia (configuracion/acceso.ts) que solo sirve
// para ocultar opciones. El backend es siempre quien decide de verdad.
// =============================================================================
import type { Role } from './roles';

// Todas las capacidades del sistema. Cada una es un permiso concreto que una
// ruta exige con can('<capacidad>').
export const CAPABILITIES = [
  'appointments_read',      // ver la agenda de citas
  'availability_read',      // ver disponibilidad de médicos entre sucursales
  'appointments_manage',    // crear, reprogramar y cancelar citas
  'schedules_manage',       // horarios de médicos y días de excepción
  'patients_search',        // buscar pacientes y ver sus datos demográficos
  'patients_manage',        // crear y editar pacientes
  'medical_records_read',   // leer expedientes clínicos
  'medical_records_author', // escribir expedientes y enmiendas
  'medical_records_output', // imprimir o exportar expedientes
  'referrals_manage',       // interconsultas (acceso temporal entre médicos)
  'prescriptions_author',   // emitir recetas
  'prescriptions_read',     // ver recetas (óptica solo con consentimiento activo)
  'consents_manage',        // registrar y revocar consentimientos
  'consents_read',          // consultar si existe un consentimiento
  'optical_orders_manage',  // crear y avanzar órdenes de óptica
  'optical_orders_read',    // consultar órdenes de óptica
  'reminders_read',         // bandeja de recordatorios simulados
  'users_manage',           // crear y administrar usuarios
  'branches_manage',        // administrar sucursales
  'audit_read',             // leer la bitácora de auditoría
  'dashboard_read',         // indicadores generales sin datos de pacientes
] as const;

export type Capability = (typeof CAPABILITIES)[number];

// Los dos perfiles de permisos. La lista se usa también para validar la
// variable de entorno PERFIL_PERMISOS (entorno.ts).
export const PERMISSION_PROFILES = ['demostracion', 'estricto'] as const;

export type PermissionProfile = (typeof PERMISSION_PROFILES)[number];

// Todos los roles menos el administrador. Sus permisos son IGUALES en ambos
// perfiles; por eso se definen aparte del administrador.
type NonAdminRole = Exclude<Role, 'admin'>;

// -----------------------------------------------------------------------------
// Permisos de los roles que NO son administrador (iguales en los dos perfiles).
// Notas sobre las celdas menos obvias:
//  - Óptica (encargado_venta) ve la receta, no el expediente: necesita esfera,
//    cilindro y eje, no el diagnóstico. Y solo la ve si el paciente tiene un
//    consentimiento activo; esa condición NO se decide aquí sino en el servicio
//    de acceso a pacientes (el permiso solo abre la puerta de la ruta).
//  - El directivo solo ve indicadores: ninguna de sus capacidades devuelve filas
//    de pacientes. Eso lo garantizan los endpoints del panel.
// -----------------------------------------------------------------------------
const ROLE_CAPABILITIES: Record<Capability, readonly NonAdminRole[]> = {
  appointments_read: ['doctor', 'recepcionista'],
  availability_read: ['doctor', 'recepcionista'],
  appointments_manage: ['recepcionista'],
  schedules_manage: [],
  patients_search: ['doctor', 'recepcionista', 'encargado_venta'],
  patients_manage: ['recepcionista'],
  medical_records_read: ['doctor'],
  medical_records_author: ['doctor'],
  medical_records_output: ['doctor'],
  referrals_manage: ['doctor'],
  prescriptions_author: ['doctor'],
  prescriptions_read: ['doctor', 'encargado_venta'],
  consents_manage: ['doctor', 'recepcionista'],
  consents_read: ['doctor', 'recepcionista', 'encargado_venta'],
  optical_orders_manage: ['encargado_venta'],
  optical_orders_read: ['encargado_venta'],
  reminders_read: ['recepcionista'],
  users_manage: [],
  branches_manage: [],
  audit_read: ['directivo'],
  dashboard_read: ['directivo'],
};

// -----------------------------------------------------------------------------
// Qué puede hacer el administrador en el perfil ESTRICTO.
// Queda con lo que necesita para administrar: usuarios, sucursales, horarios,
// consentimientos, auditoría y consultas que no son clínicas.
// Pierde todo dato clínico (expedientes, recetas, interconsultas) y las
// acciones que cambian citas, pacientes y órdenes: quien administra los accesos
// no debería leer pacientes. En el perfil "demostracion" el administrador tiene
// TODAS las capacidades.
// -----------------------------------------------------------------------------
const STRICT_ADMIN_CAPABILITIES: readonly Capability[] = [
  'appointments_read',
  'availability_read',
  'schedules_manage',
  'patients_search',
  'consents_manage',
  'consents_read',
  'optical_orders_read',
  'reminders_read',
  'users_manage',
  'branches_manage',
  'audit_read',
  'dashboard_read',
];

// Mapa final: para cada capacidad, la lista de roles que la tienen.
export type PermissionMap = Record<Capability, readonly Role[]>;

// Arma el mapa de permisos de un perfil.
// Recibe: el nombre del perfil ('demostracion' o 'estricto').
// Devuelve: el mapa capacidad -> roles. Los roles distintos del administrador
// son los mismos en ambos perfiles; solo cambia si 'admin' está en cada lista.
export function buildPermissions(profile: PermissionProfile): PermissionMap {
  const adminCapabilities: readonly Capability[] =
    profile === 'demostracion' ? CAPABILITIES : STRICT_ADMIN_CAPABILITIES;

  const permissions = {} as Record<Capability, readonly Role[]>;
  for (const capability of CAPABILITIES) {
    const roles: readonly Role[] = ROLE_CAPABILITIES[capability];
    permissions[capability] = adminCapabilities.includes(capability)
      ? ['admin', ...roles]
      : roles;
  }
  return permissions;
}

// Indica si un rol tiene una capacidad en un mapa de permisos dado.
// Recibe: el mapa, el rol y la capacidad.
// Devuelve: true si el rol está en la lista de esa capacidad.
export function hasCapability(
  permissions: PermissionMap,
  role: Role,
  capability: Capability,
): boolean {
  return permissions[capability].includes(role);
}

// Lista las capacidades que tiene un rol en un mapa de permisos dado.
// Recibe: el mapa y el rol. Devuelve: las capacidades, en el orden de CAPABILITIES.
// La usa el inicio de sesión para PUBLICAR al frontend lo que el usuario puede
// hacer: así el frontend no necesita una copia propia de este mapa (que
// terminaría desactualizada) y el menú sigue solo al perfil de permisos activo.
export function capabilitiesForRole(permissions: PermissionMap, role: Role): Capability[] {
  return CAPABILITIES.filter((capability) => hasCapability(permissions, role, capability));
}
