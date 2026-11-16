// =============================================================================
// serviciosInterconsultas.prueba.ts
// Qué prueba:   que las llamadas de interconsultas (listar, candidatos, dar y
//               revocar) envíen la ruta, el método y el cuerpo correctos, y que
//               no exista una llamada para borrar.
// =============================================================================
import { describe, expect, it } from 'vitest';
import * as interconsultas from '../../src/servicios/interconsultas';
import { grantReferral, listReferralCandidates, listReferrals, revokeReferral } from '../../src/servicios/interconsultas';
import { installFakeApi } from '../ayudas/apiFalsa';

describe('servicios de interconsultas', () => {
  it('listReferrals pide las del paciente y devuelve la lista', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [{ id: 'i1' }] } }));
    expect(await listReferrals('p1')).toEqual([{ id: 'i1' }]);
    expect(received[0]).toMatchObject({ method: 'get', url: '/pacientes/p1/interconsultas' });
  });

  it('listReferralCandidates pide los médicos elegibles', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [{ id: 'd1', full_name: 'Dr. A' }] } }));
    expect(await listReferralCandidates('p1')).toEqual([{ id: 'd1', full_name: 'Dr. A' }]);
    expect(received[0]).toMatchObject({ method: 'get', url: '/pacientes/p1/interconsultas/candidatos' });
  });

  it('grantReferral hace POST con el cuerpo y devuelve la interconsulta', async () => {
    const received = installFakeApi(() => ({ status: 201, data: { data: { id: 'i1' } } }));
    const input = { provider_id: 'd1', reason: 'Segunda opinión', days: 7 };
    expect(await grantReferral('p1', input)).toEqual({ id: 'i1' });
    expect(received[0]).toMatchObject({ method: 'post', url: '/pacientes/p1/interconsultas', body: input });
  });

  it('revokeReferral hace POST a la ruta de revocar de ESA interconsulta', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: { id: 'i1', status: 'revoked' } } }));
    expect(await revokeReferral('p1', 'i1')).toEqual({ id: 'i1', status: 'revoked' });
    expect(received[0]).toMatchObject({ method: 'post', url: '/pacientes/p1/interconsultas/i1/revocar' });
  });

  it('el servicio no ofrece ninguna función para borrar', () => {
    const functions = Object.keys(interconsultas).filter((key) => typeof (interconsultas as Record<string, unknown>)[key] === 'function');
    expect(functions.sort()).toEqual(['grantReferral', 'listReferralCandidates', 'listReferrals', 'revokeReferral']);
  });
});
