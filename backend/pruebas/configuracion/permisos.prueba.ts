// =============================================================================
// permisos.prueba.ts
// Qué prueba:   que el mapa de permisos coincide, celda por celda, con la tabla
//               de la sección 7 del documento de diseño, en los DOS perfiles.
// Por qué:      un permiso mal puesto es una falla de seguridad silenciosa. Esta
//               tabla es la "especificación escrita aparte": si alguien edita
//               permisos.ts sin querer, una de estas pruebas falla.
// Depende de:   configuracion/permisos.ts y configuracion/roles.ts.
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  buildPermissions,
  CAPABILITIES,
  hasCapability,
  type Capability,
} from '../../src/configuracion/permisos';
import { ROLES, type Role } from '../../src/configuracion/roles';

// Una fila de la tabla de la sección 7.
interface SpecRow {
  capability: Capability;
  roles: Role[];        // roles distintos del administrador (iguales en ambos perfiles)
  adminDemo: boolean;   // ¿el administrador la tiene en el perfil demostración?
  adminStrict: boolean; // ¿y en el perfil estricto?
}

const SPEC: SpecRow[] = [
  { capability: 'appointments_read',      roles: ['doctor', 'recepcionista'],                      adminDemo: true, adminStrict: true },
  { capability: 'availability_read',      roles: ['doctor', 'recepcionista'],                      adminDemo: true, adminStrict: true },
  { capability: 'appointments_manage',    roles: ['recepcionista'],                                adminDemo: true, adminStrict: false },
  { capability: 'schedules_manage',       roles: [],                                               adminDemo: true, adminStrict: true },
  { capability: 'patients_search',        roles: ['doctor', 'recepcionista', 'encargado_venta'],   adminDemo: true, adminStrict: true },
  { capability: 'patients_manage',        roles: ['recepcionista'],                                adminDemo: true, adminStrict: false },
  { capability: 'medical_records_read',   roles: ['doctor'],                                       adminDemo: true, adminStrict: false },
  { capability: 'medical_records_author', roles: ['doctor'],                                       adminDemo: true, adminStrict: false },
  { capability: 'medical_records_output', roles: ['doctor'],                                       adminDemo: true, adminStrict: false },
  { capability: 'referrals_manage',       roles: ['doctor'],                                       adminDemo: true, adminStrict: false },
  { capability: 'prescriptions_author',   roles: ['doctor'],                                       adminDemo: true, adminStrict: false },
  { capability: 'prescriptions_read',     roles: ['doctor', 'encargado_venta'],                    adminDemo: true, adminStrict: false },
  { capability: 'consents_manage',        roles: ['doctor', 'recepcionista'],                      adminDemo: true, adminStrict: true },
  { capability: 'consents_read',          roles: ['doctor', 'recepcionista', 'encargado_venta'],   adminDemo: true, adminStrict: true },
  { capability: 'optical_orders_manage',  roles: ['encargado_venta'],                              adminDemo: true, adminStrict: false },
  { capability: 'optical_orders_read',    roles: ['encargado_venta'],                              adminDemo: true, adminStrict: true },
  { capability: 'reminders_read',         roles: ['recepcionista'],                                adminDemo: true, adminStrict: true },
  { capability: 'users_manage',           roles: [],                                               adminDemo: true, adminStrict: true },
  { capability: 'branches_manage',        roles: [],                                               adminDemo: true, adminStrict: true },
  { capability: 'audit_read',             roles: ['directivo'],                                    adminDemo: true, adminStrict: true },
  { capability: 'dashboard_read',         roles: ['directivo'],                                    adminDemo: true, adminStrict: true },
];

// Capacidades que dan acceso a datos clínicos de pacientes.
const CLINICAL_CAPABILITIES: Capability[] = [
  'medical_records_read',
  'medical_records_author',
  'medical_records_output',
  'referrals_manage',
  'prescriptions_author',
  'prescriptions_read',
];

describe('tabla de permisos (sección 7)', () => {
  it('la tabla de la prueba cubre todas las capacidades, sin faltar ni sobrar', () => {
    const inSpec = SPEC.map((row) => row.capability).sort();
    expect(inSpec).toEqual([...CAPABILITIES].sort());
  });

  describe.each(['demostracion', 'estricto'] as const)('perfil %s', (profile) => {
    const permissions = buildPermissions(profile);

    it.each(SPEC)('$capability: lista exacta de roles', (row) => {
      const adminHasIt = profile === 'demostracion' ? row.adminDemo : row.adminStrict;
      const expected = adminHasIt ? ['admin', ...row.roles] : row.roles;
      expect([...permissions[row.capability]].sort()).toEqual([...expected].sort());
    });
  });
});

describe('diferencia entre perfiles', () => {
  const demo = buildPermissions('demostracion');
  const strict = buildPermissions('estricto');

  it('en demostración el administrador tiene todas las capacidades', () => {
    for (const capability of CAPABILITIES) {
      expect(hasCapability(demo, 'admin', capability)).toBe(true);
    }
  });

  it('en estricto el administrador NO tiene ninguna capacidad clínica', () => {
    for (const capability of CLINICAL_CAPABILITIES) {
      expect(hasCapability(strict, 'admin', capability)).toBe(false);
    }
  });

  it('en estricto el administrador conserva la administración y la auditoría', () => {
    for (const capability of ['users_manage', 'branches_manage', 'audit_read'] as const) {
      expect(hasCapability(strict, 'admin', capability)).toBe(true);
    }
  });

  it('los perfiles solo se diferencian en el administrador', () => {
    for (const role of ROLES.filter((r) => r !== 'admin')) {
      for (const capability of CAPABILITIES) {
        expect(hasCapability(strict, role, capability)).toBe(
          hasCapability(demo, role, capability),
        );
      }
    }
  });
});

describe('reglas de seguridad por rol', () => {
  for (const profile of ['demostracion', 'estricto'] as const) {
    const permissions = buildPermissions(profile);

    it(`[${profile}] el directivo solo tiene auditoría e indicadores`, () => {
      const held = CAPABILITIES.filter((c) => hasCapability(permissions, 'directivo', c));
      expect(held.sort()).toEqual(['audit_read', 'dashboard_read']);
    });

    it(`[${profile}] óptica no lee expedientes ni escribe recetas`, () => {
      expect(hasCapability(permissions, 'encargado_venta', 'medical_records_read')).toBe(false);
      expect(hasCapability(permissions, 'encargado_venta', 'prescriptions_author')).toBe(false);
    });

    it(`[${profile}] recepción no ve información clínica`, () => {
      for (const capability of CLINICAL_CAPABILITIES) {
        expect(hasCapability(permissions, 'recepcionista', capability)).toBe(false);
      }
    });
  }
});
