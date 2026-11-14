// =============================================================================
// datosSesion.ts
// Qué hace:     datos de sesión de ejemplo, con la misma forma que entrega la API.
// Lo usan:      las pruebas de sesión e inicio de sesión.
// =============================================================================
import type { Branch, LoginData, SessionData } from '../../src/servicios/tiposSesion';

export const CENTRAL: Branch = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'CENTRAL',
  name: 'Candray Central',
  address: null,
  phone: null,
  opening_time: '08:00:00',
  closing_time: '17:00:00',
  theme_color: '#0F766E',
  has_optical_counter: true,
};

export const ESCALON: Branch = {
  ...CENTRAL,
  id: '22222222-2222-4222-8222-222222222222',
  code: 'ESCALON',
  name: 'Candray Escalón',
  theme_color: '#1D4ED8',
};

export const SESSION: SessionData = {
  user: { id: 'u1', full_name: 'Dr. Alejandro Mejía', email: 'dr.mejia@candray.test', role: 'doctor' },
  capabilities: ['appointments_read', 'medical_records_read'],
  branches: [CENTRAL, ESCALON],
  activeBranchId: CENTRAL.id,
};

export const LOGIN: LoginData = { ...SESSION, token: 'token-de-prueba' };
