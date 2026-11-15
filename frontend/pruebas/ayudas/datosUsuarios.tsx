// =============================================================================
// datosUsuarios.ts
// Qué hace:     datos de ejemplo y una API falsa para probar la pantalla de
//               usuarios: tres usuarios (administrador actual, médica con dos
//               sucursales, recepcionista inactivo y bloqueado) y tres sucursales
//               (dos activas y Metrosur inactiva).
// Lo usan:      las pruebas de pruebas/usuarios.
// =============================================================================
import { screen } from '@testing-library/react';
import { PaginaUsuarios } from '../../src/paginas/usuarios/PaginaUsuarios';
import type { ManagedUser } from '../../src/servicios/usuarios';
import { installFakeApi, type RecordedRequest } from './apiFalsa';
import { renderConSesion } from './conSesion';
import { CENTRAL, ESCALON } from './datosSesion';

export const METROSUR_ID = '33333333-3333-4333-8333-333333333333';

export const branchOf = (b: typeof CENTRAL, isDefault = true) => ({ id: b.id, code: b.code, name: b.name, is_default: isDefault });

export const SELF: ManagedUser = {
  id: 'u1', full_name: 'Alejandro Mejía', email: 'dr.mejia@candray.test', role: 'admin', is_active: true,
  last_login: '2026-11-10 08:30:00', created_at: '2026-01-01 00:00:00', is_locked: false, branches: [],
};
export const DOCTOR: ManagedUser = {
  id: 'u2', full_name: 'Marta Doctora', email: 'marta@candray.test', role: 'doctor', is_active: true,
  last_login: null, created_at: '2026-01-01 00:00:00', is_locked: false,
  branches: [branchOf(CENTRAL), branchOf(ESCALON, false)],
};
export const LOCKED: ManagedUser = {
  id: 'u3', full_name: 'Raúl Recepción', email: 'raul@candray.test', role: 'recepcionista', is_active: false,
  last_login: null, created_at: '2026-01-01 00:00:00', is_locked: true, branches: [],
};

export const BRANCHES = [
  { ...CENTRAL, address: null, phone: null, is_active: true, created_at: '', user_count: 1 },
  { ...ESCALON, address: null, phone: null, is_active: true, created_at: '', user_count: 0 },
  { ...ESCALON, id: METROSUR_ID, name: 'Metrosur', code: 'METROSUR', is_active: false, created_at: '', user_count: 0 },
];

// API falsa con un "servidor" simple: lista, sucursales, y respuestas configurables.
export function server(overrides: (request: RecordedRequest) => { status: number; data?: unknown } | undefined = () => undefined) {
  return installFakeApi((request) => {
    const custom = overrides(request);
    if (custom !== undefined) return custom;
    if (request.method === 'get' && request.url === '/usuarios') return { status: 200, data: { data: [SELF, DOCTOR, LOCKED] } };
    if (request.method === 'get' && request.url === '/sucursales') return { status: 200, data: { data: BRANCHES } };
    if (request.method === 'post' && request.url === '/usuarios') return { status: 201, data: { data: { ...DOCTOR, id: 'nuevo' } } };
    if (request.method === 'patch') return { status: 200, data: { data: DOCTOR } };
    if (request.method === 'put' && request.url.endsWith('/sucursales')) return { status: 200, data: { data: DOCTOR } };
    if (request.method === 'put' && request.url.endsWith('/contrasena')) return { status: 200, data: { success: true, message: 'Contraseña actualizada.' } };
    if (request.method === 'post' && request.url.endsWith('/desbloquear')) return { status: 200, data: { data: { ...LOCKED, is_locked: false } } };
    return { status: 404 };
  });
}

export const mount = () => renderConSesion(<PaginaUsuarios />, { role: 'admin', capabilities: ['users_manage'] });
export const row = (name: string) => screen.getByText(name).closest('tr')!;
// Campos de la ventana abierta. Se buscan por rol y nombre accesible (sin el asterisco)
// y SOLO dentro del diálogo: "Rol" también existe en la barra de filtros de la página.
export const usersGets = (received: RecordedRequest[]) => received.filter((r) => r.method === 'get' && r.url === '/usuarios');
