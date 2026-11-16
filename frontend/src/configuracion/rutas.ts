// =============================================================================
// rutas.ts (configuración del frontend)
// Qué hace:     el MAPA de pantallas de la aplicación: para cada una, su
//               dirección, su nombre en el menú, su icono, la sección del menú
//               donde va y la capacidad que se necesita para verla.
//               Además, dos funciones que responden "¿qué ve esta persona?".
// Lo usan:      la barra lateral, la página de inicio y el control de rutas.
//
// Una sola fuente de verdad: el menú, la protección de cada ruta y la lista de
// accesos del Inicio salen TODOS de este mapa. (En Hospital Mio había tres
// copias que terminaron distintas entre sí.) Para agregar una pantalla se añade
// una línea aquí y su página en navegacion/RutasAplicacion.tsx; el compilador
// avisa si falta alguna de las dos.
//
// Quién tiene cada capacidad NO se decide aquí: lo publica el backend al iniciar
// sesión. Este archivo solo dice qué capacidad pide cada pantalla.
//
// IMPORTANTE: ocultar una opción del menú NO es seguridad. Quien realmente
// autoriza cada acción es el backend; esto solo evita mostrar lo que daría error.
// =============================================================================
import {
  Bell, Building2, CalendarDays, Clock, Glasses, House, LayoutDashboard, ScrollText, UserRound, Users, type LucideIcon,
} from 'lucide-react';
import type { Capability } from './capacidades';

// Secciones del menú, en el orden en que se muestran. Una sección sin opciones
// visibles para la persona no aparece.
export const SECTIONS = [
  { key: 'general', label: 'General' },
  { key: 'clinico', label: 'Clínico' },
  { key: 'optica', label: 'Óptica' },
  { key: 'administracion', label: 'Administración' },
] as const;

export type SectionKey = (typeof SECTIONS)[number]['key'];

export interface RouteDef {
  id: string;
  path: string;
  label: string;        // nombre en el menú y título de la página
  description: string;  // una línea para la lista de accesos del Inicio
  section: SectionKey;
  icon: LucideIcon;
  capability: Capability | null; // null = cualquier persona con sesión
}

// Las pantallas. "as const satisfies" fija los ids exactos (para que la tabla de
// páginas no pueda olvidar ninguna) y a la vez comprueba la forma de cada una.
export const ROUTES = [
  {
    id: 'inicio',
    path: '/',
    label: 'Inicio',
    description: 'Resumen de su sesión y de la sucursal activa.',
    section: 'general',
    icon: House,
    capability: null,
  },
  {
    id: 'panel',
    path: '/panel',
    label: 'Panel de indicadores',
    description: 'Ver los números del día de cada sucursal.',
    section: 'general',
    icon: LayoutDashboard,
    capability: 'dashboard_read',
  },
  {
    id: 'pacientes',
    path: '/pacientes',
    label: 'Pacientes',
    description: 'Buscar pacientes y mantener sus datos.',
    section: 'clinico',
    icon: UserRound,
    capability: 'patients_search',
  },
  {
    id: 'citas',
    path: '/citas',
    label: 'Citas',
    description: 'Ver la agenda del día y atender las citas.',
    section: 'clinico',
    icon: CalendarDays,
    capability: 'appointments_read',
  },
  {
    id: 'recordatorios',
    path: '/recordatorios',
    label: 'Recordatorios',
    description: 'Ver a quién se le recordaría su cita de hoy y mañana.',
    section: 'clinico',
    icon: Bell,
    capability: 'reminders_read',
  },
  {
    id: 'ordenes-optica',
    path: '/ordenes-optica',
    label: 'Órdenes de óptica',
    description: 'Ver y avanzar las ventas de lentes de la sucursal.',
    section: 'optica',
    icon: Glasses,
    capability: 'optical_orders_read',
  },
  {
    id: 'usuarios',
    path: '/usuarios',
    label: 'Usuarios',
    description: 'Crear y administrar las cuentas del personal.',
    section: 'administracion',
    icon: Users,
    capability: 'users_manage',
  },
  {
    id: 'horarios',
    path: '/horarios',
    label: 'Horarios de médicos',
    description: 'Definir los días y horas de atención de cada médico.',
    section: 'administracion',
    icon: Clock,
    capability: 'schedules_manage',
  },
  {
    id: 'sucursales',
    path: '/sucursales',
    label: 'Sucursales',
    description: 'Ver y editar las sucursales de Candray.',
    section: 'administracion',
    icon: Building2,
    capability: 'branches_manage',
  },
  {
    id: 'auditoria',
    path: '/auditoria',
    label: 'Auditoría',
    description: 'Consultar la bitácora de acciones del sistema.',
    section: 'administracion',
    icon: ScrollText,
    capability: 'audit_read',
  },
] as const satisfies readonly RouteDef[];

export type RouteId = (typeof ROUTES)[number]['id'];

// El expediente de un paciente NO está en el menú (necesita saber de qué
// paciente es): se abre desde la lista de pacientes. Por eso no está en ROUTES,
// pero su dirección y la capacidad que pide viven aquí, junto al resto.
export const RECORD_ROUTE = { path: '/pacientes/:patientId/expediente', capability: 'medical_records_read' } as const;

// La dirección del expediente de un paciente concreto.
export const recordPath = (patientId: string): string => `/pacientes/${patientId}/expediente`;

// Función que responde "¿puede esta persona hacer X?" (viene de la sesión).
export type CanFn = (capability: Capability) => boolean;

// ¿Puede esta persona abrir esta pantalla?
export function canOpen(route: RouteDef, can: CanFn): boolean {
  return route.capability === null || can(route.capability);
}

export interface VisibleSection {
  key: SectionKey;
  label: string;
  routes: RouteDef[];
}

// Las secciones del menú con las pantallas que esta persona puede abrir.
// Las secciones que quedan vacías se descartan. Si la persona no tiene ninguna
// capacidad, solo ve las pantallas abiertas a cualquiera (el Inicio): se
// muestra lo mínimo, nunca de más.
export function visibleSections(can: CanFn): VisibleSection[] {
  return SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    routes: ROUTES.filter((route) => route.section === section.key && canOpen(route, can)),
  })).filter((section) => section.routes.length > 0);
}
