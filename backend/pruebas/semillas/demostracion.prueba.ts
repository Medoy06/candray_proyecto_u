// =============================================================================
// demostracion.prueba.ts
// Qué prueba:   que la semilla de demostración deja un sistema utilizable:
//               cada usuario inicia sesión con la contraseña de demostración y
//               ve exactamente las sucursales que le corresponden.
// Cómo:         siembra la base de pruebas una vez y llama al login por HTTP.
// Depende de:   base_datos/semillas/demostracion.ts y app.ts.
// =============================================================================
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, DEMO_USERS, seedDemo } from '../../../base_datos/semillas/demostracion';
import { createApp } from '../../src/app';

const app = createApp();

// Códigos de las sucursales de la semilla (la base de pruebas puede tener otras
// sucursales creadas por otras pruebas; solo se comparan las de la semilla).
const SEED_CODES = ['CENTRAL', 'ESCALON', 'SANTA_TECLA'];

const login = (email: string) =>
  request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });

describe('Semilla de demostración', () => {
  beforeAll(async () => {
    await seedDemo();
  });

  it('crea un usuario por cada rol', () => {
    const roles = new Set(DEMO_USERS.map((user) => user.role));
    expect(roles).toEqual(new Set(['admin', 'doctor', 'recepcionista', 'encargado_venta', 'directivo']));
  });

  it.each(DEMO_USERS)('$email inicia sesión como $role', async (demoUser) => {
    const response = await login(demoUser.email);
    expect(response.status).toBe(200);
    expect(response.body.data.user.role).toBe(demoUser.role);
  });

  // El administrador y el directivo se excluyen: ven TODAS las sucursales activas,
  // tengan o no asignaciones (se prueban aparte, más abajo).
  it.each(DEMO_USERS.filter((user) => user.role !== 'admin' && user.role !== 'directivo'))(
    '$email ve exactamente sus sucursales, con la predeterminada primero',
    async (demoUser) => {
      const response = await login(demoUser.email);
      const codes = response.body.data.branches
        .map((branch: { code: string }) => branch.code)
        .filter((code: string) => SEED_CODES.includes(code));
      expect(codes).toEqual(demoUser.branchCodes);
    },
  );

  it('el médico itinerante trabaja en Central y Escalón, y entra por Central', async () => {
    const response = await login('dr.mejia@candray.test');
    const codes = response.body.data.branches.map((branch: { code: string }) => branch.code);
    expect(codes).toEqual(['CENTRAL', 'ESCALON']);
    expect(response.body.data.branches[0].id).toBe(response.body.data.activeBranchId);
  });

  it('el directivo y el administrador ven las sucursales activas, nunca la inactiva', async () => {
    for (const email of ['directivo@candray.test', 'admin@candray.test']) {
      const response = await login(email);
      const codes = response.body.data.branches.map((branch: { code: string }) => branch.code);
      expect(codes).toContain('CENTRAL');
      expect(codes).toContain('ESCALON');
      expect(codes).not.toContain('SANTA_TECLA');
    }
  });

  it('cada sucursal activa trae su color y su dato de óptica', async () => {
    const response = await login('dr.mejia@candray.test');
    const central = response.body.data.branches.find((b: { code: string }) => b.code === 'CENTRAL');
    const escalon = response.body.data.branches.find((b: { code: string }) => b.code === 'ESCALON');
    expect(central.theme_color).not.toBe(escalon.theme_color);
    expect(central.has_optical_counter).toBe(true);
  });

  it('una segunda siembra sobre la misma base se rechaza', async () => {
    await expect(seedDemo()).rejects.toThrow('usuarios de demostración');
  });
});
