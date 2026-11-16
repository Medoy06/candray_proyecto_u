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

  it('traducen las acciones del expediente y de las interconsultas', () => {
    expect(actionLabel('record_viewed')).toBe('Expediente consultado');
    expect(actionLabel('record_printed')).toBe('Expediente impreso');
    expect(actionLabel('record_access_denied')).toBe('Acceso al expediente denegado');
    expect(actionLabel('record_created')).toBe('Nota de expediente escrita');
    expect(actionLabel('record_amended')).toBe('Nota de expediente enmendada');
    expect(actionLabel('referral_granted')).toBe('Interconsulta otorgada');
    expect(actionLabel('referral_revoked')).toBe('Interconsulta revocada');
    expect(entityLabel('patient')).toBe('Paciente');
    expect(entityLabel('medical_record')).toBe('Expediente');
    expect(entityLabel('referral')).toBe('Interconsulta');
    expect(entityLabel('consent')).toBe('Consentimiento');
    expect(actionLabel('consent_granted')).toBe('Consentimiento registrado');
    expect(actionLabel('consent_revoked')).toBe('Consentimiento revocado');
    expect(actionLabel('prescription_issued')).toBe('Receta emitida');
    expect(actionLabel('prescription_replaced')).toBe('Receta reemplazada');
    expect(actionLabel('prescription_viewed')).toBe('Receta consultada');
    expect(actionLabel('prescription_access_denied')).toBe('Acceso a la receta denegado');
    expect(entityLabel('prescription')).toBe('Receta');
    expect(summarizeDetail({ access: 'consent' })).toEqual(['Acceso: Por consentimiento']);
    expect(summarizeDetail({ reason: 'no_consent' })).toEqual(['Motivo: Sin consentimiento del paciente']);
    expect(summarizeDetail({ patient_id: 'x', record_id: 'y', supersedes_id: 'z' })).toEqual([]);
  });

  it('traducen las acciones de las órdenes de óptica y su detalle', () => {
    expect(actionLabel('optical_order_created')).toBe('Orden de óptica creada');
    expect(actionLabel('optical_order_status_changed')).toBe('Orden de óptica cambió de estado');
    expect(actionLabel('optical_order_denied')).toBe('Orden de óptica denegada');
    expect(entityLabel('optical_order')).toBe('Orden de óptica');
    expect(summarizeDetail({ patient_id: 'x', from: 'pending', to: 'in_lab' })).toEqual(['Antes: Pendiente', 'Después: En taller']);
    expect(summarizeDetail({ from: 'ready', to: 'cancelled', reason: 'Cambió de opinión' })).toEqual([
      'Antes: Lista', 'Después: Cancelada', 'Motivo: Cambió de opinión',
    ]);
    expect(summarizeDetail({ patient_id: 'x', prescription_id: 'y' })).toEqual([]);
    expect(summarizeDetail({ reason: 'no_consent', prescription_id: 'y' })).toEqual(['Motivo: Sin consentimiento del paciente']);
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

describe('summarizeDetail — expediente e interconsultas', () => {
  it('el motivo de acceso se lee en español', () => {
    expect(summarizeDetail({ access: 'role' })).toEqual(['Acceso: Por su rol']);
    expect(summarizeDetail({ access: 'appointment' })).toEqual(['Acceso: Por una cita']);
    expect(summarizeDetail({ access: 'referral' })).toEqual(['Acceso: Por interconsulta']);
  });

  it('el motivo de una negativa se lee en español', () => {
    expect(summarizeDetail({ reason: 'no_relation' })).toEqual(['Motivo: Sin cita ni interconsulta']);
    expect(summarizeDetail({ reason: 'check_failed' })).toEqual(['Motivo: Falló la verificación']);
  });

  it('un motivo que no es un código conocido se muestra tal cual', () => {
    expect(summarizeDetail({ reason: 'Cuenta bloqueada' })).toEqual(['Motivo: Cuenta bloqueada']);
  });

  it('los identificadores del paciente, la cita, la nota y el médico no se muestran', () => {
    const detail = { patient_id: 'p', appointment_id: 'a', amends_id: 'n', provider_id: 'd', expires_at: '2026-12-01 10:00:00' };
    expect(summarizeDetail(detail)).toEqual(['Vence: 2026-12-01 10:00:00']);
  });
});
