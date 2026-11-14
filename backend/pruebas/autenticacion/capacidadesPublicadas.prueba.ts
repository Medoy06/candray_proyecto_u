// =============================================================================
// capacidadesPublicadas.prueba.ts
// Qué prueba:   que el backend PUBLICA al frontend las capacidades del usuario
//               (en el login y en /me) y que coinciden con el mapa de permisos.
// Por qué:      el menú del frontend se arma con esta lista; si fuera distinta
//               de lo que el backend realmente autoriza, el menú mostraría
//               opciones que dan 403 u ocultaría opciones permitidas.
// Depende de:   app.ts, configuracion/permisos.ts y ayudas/datosPrueba.ts.
// =============================================================================
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import {
  buildPermissions,
  CAPABILITIES,
  capabilitiesForRole,
  hasCapability,
  PERMISSION_PROFILES,
} from '../../src/configuracion/permisos';
import { ROLES } from '../../src/configuracion/roles';
import { createTestBranch, createTestUser, TEST_PASSWORD } from '../ayudas/datosPrueba';

const app = createApp();

describe('capabilitiesForRole', () => {
  it.each(PERMISSION_PROFILES.flatMap((profile) => ROLES.map((role) => [profile, role] as const)))(
    'perfil %s, rol %s: la lista coincide con hasCapability para TODAS las capacidades',
    (profile, role) => {
      const permissions = buildPermissions(profile);
      const listed = capabilitiesForRole(permissions, role);
      for (const capability of CAPABILITIES) {
        expect(listed.includes(capability)).toBe(hasCapability(permissions, role, capability));
      }
    },
  );

  it('el administrador tiene todo en demostración y pierde lo clínico en estricto', () => {
    expect(capabilitiesForRole(buildPermissions('demostracion'), 'admin')).toEqual([...CAPABILITIES]);
    const strict = capabilitiesForRole(buildPermissions('estricto'), 'admin');
    expect(strict).toContain('users_manage');
    expect(strict).not.toContain('medical_records_read');
    expect(strict).not.toContain('prescriptions_read');
  });

  it('un médico no puede administrar usuarios', () => {
    expect(capabilitiesForRole(buildPermissions('demostracion'), 'doctor')).not.toContain('users_manage');
  });
});

describe('Login y /me publican las capacidades', () => {
  // La base de pruebas usa el perfil "demostracion" (vitest.config.mts).
  const permissions = buildPermissions('demostracion');

  it.each(ROLES)('%s: login y /me devuelven las mismas capacidades que el mapa', async (role) => {
    const branch = await createTestBranch();
    const user = await createTestUser({ role, branchIds: [branch.id] });

    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.capabilities).toEqual(capabilitiesForRole(permissions, role));

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.data.token}`);
    expect(me.body.data.capabilities).toEqual(login.body.data.capabilities);
  });

  it('si cambia el rol en la base, /me refleja las capacidades nuevas (no las del token)', async () => {
    const branch = await createTestBranch();
    const user = await createTestUser({ role: 'recepcionista', branchIds: [branch.id] });
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
    expect(login.body.data.capabilities).not.toContain('medical_records_read');

    const { pool } = await import('../../src/configuracion/baseDatos');
    await pool.query(`UPDATE users SET role = 'doctor' WHERE id = $1`, [user.id]);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.data.token}`);
    expect(me.body.data.user.role).toBe('doctor');
    expect(me.body.data.capabilities).toContain('medical_records_read');
  });
});
