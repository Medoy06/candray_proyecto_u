// =============================================================================
// demostracion.ts (semilla)
// Qué hace:     inserta los datos FICTICIOS de demostración del Incremento 0:
//               las sucursales y un usuario por cada rol (más algunos extra
//               para mostrar el cambio de sucursal y al médico itinerante).
// Requerimiento: demostración reproducible (sección 11 del documento de diseño).
// Depende de:   backend/src/configuracion/baseDatos.ts y modelos/usuarios.ts.
// Lo usan:      scripts/reiniciar_demo.ts y las pruebas de la semilla.
//
// Todos los datos son inventados: correos del dominio .test, nombres ficticios,
// direcciones y teléfonos de demostración. Los nombres de las sucursales sí
// existen en Candray (Central, Escalón, Santa Tecla...), tomados de la
// documentación del proyecto.
//
// Esta semilla va sobre una base VACÍA. Si ya hay usuarios de demostración, se
// niega a continuar (reiniciar_demo.ts vacía la base antes de sembrar).
// =============================================================================
import { pool } from '../../backend/src/configuracion/baseDatos';
import type { Role } from '../../backend/src/configuracion/roles';
import { createUser } from '../../backend/src/modelos/usuarios';

// Contraseña de TODOS los usuarios de demostración. Es pública a propósito
// (aparece en la documentación): solo sirve en la base de demostración.
export const DEMO_PASSWORD = 'Candray2026!';

interface DemoBranch {
  code: string;
  name: string;
  address: string;
  phone: string;
  opening_time: string;
  closing_time: string;
  theme_color: string; // color de acento PROVISIONAL, se ajustará a la paleta de Candray
  has_optical_counter: boolean;
  is_active: boolean;
}

interface DemoUser {
  email: string;
  full_name: string;
  role: Role;
  branchCodes: string[]; // la primera es la sucursal predeterminada
}

// Dos sucursales piloto activas y una tercera inactiva (para mostrar que una
// sucursal inactiva no aparece en el selector).
export const DEMO_BRANCHES: DemoBranch[] = [
  {
    code: 'CENTRAL',
    name: 'Candray Central',
    address: 'San Salvador (dirección de demostración)',
    phone: '2222-0001',
    opening_time: '08:00',
    closing_time: '17:00',
    theme_color: '#0F766E',
    has_optical_counter: true,
    is_active: true,
  },
  {
    code: 'ESCALON',
    name: 'Candray Escalón',
    address: 'Colonia Escalón, San Salvador (dirección de demostración)',
    phone: '2222-0002',
    opening_time: '08:00',
    closing_time: '17:00',
    theme_color: '#1D4ED8',
    has_optical_counter: true,
    is_active: true,
  },
  {
    code: 'SANTA_TECLA',
    name: 'Candray Santa Tecla',
    address: 'Santa Tecla, La Libertad (dirección de demostración)',
    phone: '2222-0003',
    opening_time: '08:00',
    closing_time: '17:00',
    theme_color: '#6B7280',
    has_optical_counter: false,
    is_active: false,
  },
];

// Usuarios de demostración. El administrador y el directivo ven todas las
// sucursales activas sin necesitar asignación; a los demás se les asigna.
export const DEMO_USERS: DemoUser[] = [
  { email: 'admin@candray.test', full_name: 'Ana Martínez (Administración)', role: 'admin', branchCodes: ['CENTRAL'] },
  // Médico itinerante: trabaja en las dos sucursales.
  { email: 'dr.mejia@candray.test', full_name: 'Dr. Alejandro Mejía', role: 'doctor', branchCodes: ['CENTRAL', 'ESCALON'] },
  { email: 'dra.rivas@candray.test', full_name: 'Dra. Lucía Rivas', role: 'doctor', branchCodes: ['CENTRAL'] },
  { email: 'dr.portillo@candray.test', full_name: 'Dr. Mauricio Portillo', role: 'doctor', branchCodes: ['ESCALON'] },
  { email: 'recepcion.central@candray.test', full_name: 'Marta Flores', role: 'recepcionista', branchCodes: ['CENTRAL'] },
  { email: 'recepcion.escalon@candray.test', full_name: 'José Henríquez', role: 'recepcionista', branchCodes: ['ESCALON'] },
  { email: 'optica.central@candray.test', full_name: 'Sofía Campos', role: 'encargado_venta', branchCodes: ['CENTRAL'] },
  { email: 'optica.escalon@candray.test', full_name: 'Daniel Alvarado', role: 'encargado_venta', branchCodes: ['ESCALON'] },
  { email: 'directivo@candray.test', full_name: 'Roberto Quintanilla', role: 'directivo', branchCodes: [] },
];

export interface SeedSummary {
  branches: number;
  users: number;
}

// Siembra las sucursales y los usuarios de demostración.
// Devuelve: cuántas sucursales y usuarios se crearon.
// Lanza error: si ya existen usuarios de demostración.
export async function seedDemo(): Promise<SeedSummary> {
  const existing = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM users WHERE email LIKE '%@candray.test'`,
  );
  if (existing.rows[0].n > 0) {
    throw new Error(
      'La base ya tiene usuarios de demostración. Use "npm run reiniciar_demo" para empezar de cero.',
    );
  }

  // 1) Sucursales; se guarda el id de cada una según su código.
  const branchIds = new Map<string, string>();
  for (const branch of DEMO_BRANCHES) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO branches
         (code, name, address, phone, opening_time, closing_time,
          theme_color, has_optical_counter, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        branch.code, branch.name, branch.address, branch.phone,
        branch.opening_time, branch.closing_time,
        branch.theme_color, branch.has_optical_counter, branch.is_active,
      ],
    );
    branchIds.set(branch.code, result.rows[0].id);
  }

  // 2) Usuarios y sus sucursales (la primera de la lista es la predeterminada).
  for (const demoUser of DEMO_USERS) {
    const user = await createUser({
      full_name: demoUser.full_name,
      email: demoUser.email,
      password: DEMO_PASSWORD,
      role: demoUser.role,
    });
    for (const [index, code] of demoUser.branchCodes.entries()) {
      await pool.query(
        'INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, $3)',
        [user.id, branchIds.get(code), index === 0],
      );
    }
  }

  return { branches: DEMO_BRANCHES.length, users: DEMO_USERS.length };
}
