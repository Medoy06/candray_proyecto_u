// =============================================================================
// auditoriaAutenticacion.prueba.ts
// Qué prueba:   que la bitácora de auditoría (a) NO guarda contraseñas pegadas
//               por error en el campo de correo y (b) es de solo agregar:
//               UPDATE y DELETE fallan.
// Cómo:         contra la base de datos de pruebas real (candray_test).
// Depende de:   utilidades/auditoriaAutenticacion.ts y la migración 01.
// =============================================================================
import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import { pool } from '../../src/configuracion/baseDatos';
import {
  logLoginFailed,
  NOT_AN_EMAIL,
  sanitizeAttemptedEmail,
} from '../../src/utilidades/auditoriaAutenticacion';

describe('sanitizeAttemptedEmail', () => {
  it('conserva un correo y lo pasa a minúsculas', () => {
    expect(sanitizeAttemptedEmail('  Ana@Candray.TEST ')).toBe('ana@candray.test');
  });

  it('no conserva un texto que no parece un correo (podría ser una contraseña)', () => {
    expect(sanitizeAttemptedEmail('MiContraseñaSecreta123')).toBe(NOT_AN_EMAIL);
    expect(sanitizeAttemptedEmail('')).toBe(NOT_AN_EMAIL);
  });
});

describe('Registro de inicios de sesión fallidos', () => {
  it('guarda el motivo y la IP, pero no una contraseña escrita en el campo de correo', async () => {
    const secret = `Clave-${randomUUID()}`;
    const ip = '203.0.113.7';

    await logLoginFailed({ attemptedEmail: secret, reason: 'unknown_email', ip });

    const result = await pool.query(
      `SELECT detail FROM audit_log WHERE action = 'login_failed' AND detail->>'ip' = $1
        ORDER BY created_at DESC LIMIT 1`,
      [ip],
    );
    expect(result.rows[0].detail.reason).toBe('unknown_email');
    expect(result.rows[0].detail.email).toBe(NOT_AN_EMAIL);
    expect(JSON.stringify(result.rows[0].detail)).not.toContain(secret);
  });
});

describe('audit_log es de solo agregar', () => {
  it('un UPDATE directo falla', async () => {
    await logLoginFailed({ attemptedEmail: 'x@prueba.test', reason: 'bad_password', ip: '203.0.113.8' });
    await expect(pool.query(`UPDATE audit_log SET action = 'otra_cosa'`)).rejects.toThrow();
  });

  it('un DELETE directo falla', async () => {
    await expect(pool.query('DELETE FROM audit_log')).rejects.toThrow();
  });

  it('un TRUNCATE directo falla', async () => {
    await expect(pool.query('TRUNCATE audit_log')).rejects.toThrow();
  });
});
