// =============================================================================
// serviciosConsentimientos.prueba.ts
// Qué prueba:   que las llamadas de consentimientos (listar, registrar y
//               revocar) envíen la ruta, el método y el cuerpo correctos, y que
//               no exista una llamada para borrar.
// =============================================================================
import { describe, expect, it } from 'vitest';
import * as consentimientos from '../../src/servicios/consentimientos';
import { grantConsent, listConsents, revokeConsent } from '../../src/servicios/consentimientos';
import { installFakeApi } from '../ayudas/apiFalsa';

describe('servicios de consentimientos', () => {
  it('listConsents pide el historial del paciente y devuelve la lista', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [{ id: 'c1' }] } }));
    expect(await listConsents('p1')).toEqual([{ id: 'c1' }]);
    expect(received[0]).toMatchObject({ method: 'get', url: '/pacientes/p1/consentimientos' });
  });

  it('grantConsent hace POST con la nota sin espacios sobrantes', async () => {
    const received = installFakeApi(() => ({ status: 201, data: { data: { id: 'c1' } } }));
    expect(await grantConsent('p1', '  Firmó en recepción  ')).toEqual({ id: 'c1' });
    expect(received[0]).toMatchObject({ method: 'post', url: '/pacientes/p1/consentimientos', body: { note: 'Firmó en recepción' } });
  });

  it.each(['', '   '])('grantConsent manda null cuando la nota está vacía (%j)', async (note) => {
    const received = installFakeApi(() => ({ status: 201, data: { data: { id: 'c1' } } }));
    await grantConsent('p1', note);
    expect(received[0].body).toEqual({ note: null });
  });

  it('revokeConsent hace POST a la ruta de revocar de ESE consentimiento', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: { id: 'c1', status: 'revoked' } } }));
    expect(await revokeConsent('p1', 'c1')).toEqual({ id: 'c1', status: 'revoked' });
    expect(received[0]).toMatchObject({ method: 'post', url: '/pacientes/p1/consentimientos/c1/revocar' });
  });

  it('el servicio no ofrece ninguna función para borrar', () => {
    const functions = Object.keys(consentimientos).filter((key) => typeof (consentimientos as Record<string, unknown>)[key] === 'function');
    expect(functions.sort()).toEqual(['grantConsent', 'listConsents', 'revokeConsent']);
  });
});
