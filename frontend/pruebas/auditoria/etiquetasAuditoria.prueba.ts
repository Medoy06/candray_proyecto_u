// =============================================================================
// etiquetasAuditoria.prueba.ts
// Qué prueba:   la traducción de los códigos de la bitácora a texto legible:
//               acciones, tipos y el resumen del detalle (antes → después,
//               listas, booleanos, roles, datos internos ocultos, cortes).
// =============================================================================
import { describe, expect, it } from 'vitest';
import { actionLabel, entityLabel, summarizeDetail } from '../../src/paginas/auditoria/etiquetasAuditoria';

describe('actionLabel y entityLabel', () => {
  it('traducen los códigos conocidos', () => {
    expect(actionLabel('user_created')).toBe('Usuario creado');
    expect(actionLabel('login_failed')).toBe('Inicio de sesión fallido');
    expect(actionLabel('branch_updated')).toBe('Sucursal modificada');
    expect(entityLabel('auth')).toBe('Acceso');
    expect(entityLabel('user')).toBe('Usuario');
    expect(entityLabel('branch')).toBe('Sucursal');
  });

  it('un código desconocido se muestra tal cual, no se oculta', () => {
    expect(actionLabel('algo_nuevo')).toBe('algo_nuevo');
    expect(entityLabel('cita')).toBe('cita');
  });
});

describe('summarizeDetail', () => {
  it('sin detalle no hay líneas', () => {
    expect(summarizeDetail(null)).toEqual([]);
    expect(summarizeDetail({})).toEqual([]);
  });

  it('un cambio { from, to } se muestra como "antes → después"', () => {
    expect(summarizeDetail({ full_name: { from: 'Ana', to: 'Ana María' } })).toEqual(['Nombre: Ana → Ana María']);
  });

  it('los roles se muestran con su nombre en español', () => {
    expect(summarizeDetail({ role: { from: 'doctor', to: 'recepcionista' } })).toEqual(['Rol: Médico → Recepción']);
    expect(summarizeDetail({ role: 'admin' })).toEqual(['Rol: Administrador']);
  });

  it('los booleanos son Sí/No y lo vacío es una raya', () => {
    expect(summarizeDetail({ is_active: { from: true, to: false } })).toEqual(['Activo: Sí → No']);
    expect(summarizeDetail({ address: { from: null, to: 'Calle 1' } })).toEqual(['Dirección: — → Calle 1']);
  });

  it('una lista se cuenta, no se vuelca (son identificadores)', () => {
    expect(summarizeDetail({ branch_ids: ['a'] })).toEqual(['Sucursales: 1 elemento']);
    expect(summarizeDetail({ branch_ids: ['a', 'b', 'c'] })).toEqual(['Sucursales: 3 elementos']);
    expect(summarizeDetail({ branch_ids: [] })).toEqual(['Sucursales: 0 elementos']);
  });

  it('los identificadores internos no se muestran', () => {
    expect(summarizeDetail({ account_id: 'x', default_branch_id: 'y', ip: '10.0.0.1' })).toEqual(['IP: 10.0.0.1']);
  });

  it('un dato sin nombre en español se muestra con su clave', () => {
    expect(summarizeDetail({ nuevo_dato: 5 })).toEqual(['nuevo_dato: 5']);
  });

  it('ignora los datos undefined y conserva el orden', () => {
    expect(summarizeDetail({ email: 'a@b.c', reason: 'bad_password', account_id: undefined })).toEqual([
      'Correo: a@b.c',
      'Motivo: bad_password',
    ]);
  });

  it('un texto largo se corta con puntos suspensivos', () => {
    const [line] = summarizeDetail({ address: 'x'.repeat(100) });
    expect(line).toBe(`Dirección: ${'x'.repeat(60)}…`);
    const [exact] = summarizeDetail({ address: 'x'.repeat(60) });
    expect(exact).toBe(`Dirección: ${'x'.repeat(60)}`);
  });
});
