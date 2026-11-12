// =============================================================================
// roles.ts
// Qué hace:     define la lista única de roles que conoce el backend.
// Requerimiento: control de acceso por rol (sección 7 del documento de diseño).
// Depende de:   nada.
// Lo usan:      permisos.ts, los esquemas de usuarios, la siembra de datos y
//               scripts/verificar_roles.sh.
//
// Para agregar un rol hay que tocar, en este orden:
//   1. Este archivo (la lista ROLES).
//   2. La base de datos: una migración nueva con
//        ALTER TYPE user_role ADD VALUE '<rol>';
//   3. El frontend: el tipo Role y la lista de roles de configuracion/acceso.ts.
//   4. permisos.ts: qué puede hacer el nuevo rol.
// scripts/verificar_roles.sh compara las listas de los puntos 1, 2 y 3, de modo
// que olvidar uno aparece como un error y no como un hueco silencioso.
//
// `as const` conserva los valores exactos como tipos literales: así el tipo
// Role es la unión exacta de estos cinco textos y la misma lista sirve para
// validar datos de entrada (z.enum) sin escribirla dos veces.
// =============================================================================

// Los cinco roles de Candray:
//   admin            administra usuarios, sucursales y auditoría
//   doctor           atiende pacientes; puede trabajar en varias sucursales
//   recepcionista    agenda citas y registra pacientes
//   encargado_venta  atiende el mostrador de óptica
//   directivo        consulta indicadores generales (solo lectura)
export const ROLES = [
  'admin',
  'doctor',
  'recepcionista',
  'encargado_venta',
  'directivo',
] as const;

// Unión de los valores de ROLES: 'admin' | 'doctor' | ... (sin escribirla a mano).
export type Role = (typeof ROLES)[number];
