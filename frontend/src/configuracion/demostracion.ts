// =============================================================================
// demostracion.ts (configuración del frontend)
// Qué hace:     las cuentas de demostración que la pantalla de inicio de sesión
//               ofrece como atajo (solo en desarrollo, nunca en producción).
// Lo usa:       paginas/autenticacion/CuentasDemostracion.tsx.
//
// Son los usuarios que crea base_datos/semillas/demostracion.ts. La contraseña
// es pública a propósito: solo sirve en la base de demostración.
// =============================================================================
import type { Role } from './roles';

export const DEMO_PASSWORD = 'Candray2026!';

export interface DemoAccount {
  email: string;
  label: string; // lo que se muestra en el botón
  role: Role;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'admin@candray.test', label: 'Administración', role: 'admin' },
  { email: 'dr.mejia@candray.test', label: 'Médico (itinerante)', role: 'doctor' },
  { email: 'recepcion.central@candray.test', label: 'Recepción Central', role: 'recepcionista' },
  { email: 'optica.central@candray.test', label: 'Óptica Central', role: 'encargado_venta' },
  { email: 'directivo@candray.test', label: 'Directivo', role: 'directivo' },
];
