// =============================================================================
// rutasApi.ts
// Qué hace:     descubre TODAS las rutas de la API recorriendo los routers reales
//               de Express, para que las pruebas de seguridad no dependan de una
//               lista escrita a mano que pueda quedar desactualizada.
// Lo usan:      pruebas/seguridad/*.
//
// MOUNTS repite dónde monta app.ts cada archivo de rutas; una prueba comprueba
// que ambas listas coincidan, así que no puede quedar atrás sin que se note.
// =============================================================================
import auditRoutes from '../../src/rutas/auditoria';
import authRoutes from '../../src/rutas/autenticacion';
import appointmentRoutes from '../../src/rutas/citas';
import consentRoutes from '../../src/rutas/consentimientos';
import availabilityRoutes from '../../src/rutas/disponibilidad';
import recordRoutes from '../../src/rutas/expedientes';
import scheduleRoutes from '../../src/rutas/horarios';
import referralRoutes from '../../src/rutas/interconsultas';
import opticalOrderRoutes from '../../src/rutas/ordenesOptica';
import patientRoutes from '../../src/rutas/pacientes';
import dashboardRoutes from '../../src/rutas/panel';
import prescriptionRoutes from '../../src/rutas/recetas';
import reminderRoutes from '../../src/rutas/recordatorios';
import branchRoutes from '../../src/rutas/sucursales';
import userRoutes from '../../src/rutas/usuarios';

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export const P = '/api/pacientes';

// Dónde se monta cada archivo de rutas (igual que en app.ts).
export const MOUNTS: Array<{ prefix: string; router: unknown }> = [
  { prefix: '/api/auth', router: authRoutes },
  { prefix: '/api/usuarios', router: userRoutes },
  { prefix: '/api/sucursales', router: branchRoutes },
  { prefix: `${P}/:patientId/expediente`, router: recordRoutes },
  { prefix: `${P}/:patientId/interconsultas`, router: referralRoutes },
  { prefix: `${P}/:patientId/consentimientos`, router: consentRoutes },
  { prefix: `${P}/:patientId/recetas`, router: prescriptionRoutes },
  { prefix: P, router: patientRoutes },
  { prefix: '/api/horarios', router: scheduleRoutes },
  { prefix: '/api/disponibilidad', router: availabilityRoutes },
  { prefix: '/api/citas', router: appointmentRoutes },
  { prefix: '/api/ordenes-optica', router: opticalOrderRoutes },
  { prefix: '/api/panel', router: dashboardRoutes },
  { prefix: '/api/recordatorios', router: reminderRoutes },
  { prefix: '/api/auditoria', router: auditRoutes },
];

export interface Discovered { method: Method; path: string; key: string }

// Recorre un router de Express y lista sus rutas (método y ruta completa).
function routesOf(router: unknown, prefix: string): Discovered[] {
  const stack = (router as { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> }).stack;
  const found: Discovered[] = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      const full = (prefix + (layer.route.path === '/' ? '' : layer.route.path));
      found.push({ method: method as Method, path: full, key: `${method.toUpperCase()} ${full}` });
    }
  }
  return found;
}

export const DISCOVERED = MOUNTS.flatMap((mount) => routesOf(mount.router, mount.prefix));

export const UUID = '00000000-0000-4000-8000-000000000000';
export const fill = (route: string) => route.replace(/:\w+/g, UUID);
const hasBody = (method: Method) => method !== 'get' && method !== 'delete';
