// =============================================================================
// serviciosAuditoria.prueba.ts
// Qué prueba:   que el servicio pida a la API lo correcto: ruta, página,
//               tamaño de página y SOLO los filtros con valor.
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  AUDIT_PAGE_SIZE,
  EMPTY_AUDIT_FILTERS,
  getAuditFacets,
  listAudit,
} from '../../src/servicios/auditoria';
import { installFakeApi } from '../ayudas/apiFalsa';

const PAGINATION = { page: 2, page_size: 25, total: 60, total_pages: 3 };

describe('servicios/auditoria', () => {
  it('listAudit pide la página con el tamaño fijo y sin filtros vacíos', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [], pagination: PAGINATION } }));
    const result = await listAudit(EMPTY_AUDIT_FILTERS, 2);
    expect(received[0]).toMatchObject({ method: 'get', url: '/auditoria', params: { page: 2, page_size: AUDIT_PAGE_SIZE } });
    expect(result).toEqual({ rows: [], pagination: PAGINATION });
  });

  it('el tamaño de página es 25', () => {
    expect(AUDIT_PAGE_SIZE).toBe(25);
  });

  it('listAudit envía los filtros que tienen valor', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [], pagination: PAGINATION } }));
    await listAudit({ entity_type: 'user', action: '', from: '2026-11-01', to: '2026-11-13' }, 1);
    expect(received[0].params).toEqual({
      page: 1, page_size: 25, entity_type: 'user', from: '2026-11-01', to: '2026-11-13',
    });
  });

  it('getAuditFacets lee los valores para los desplegables', async () => {
    const received = installFakeApi(() => ({
      status: 200, data: { data: { entity_types: ['auth'], actions: ['login_success'] } },
    }));
    expect(await getAuditFacets()).toEqual({ entity_types: ['auth'], actions: ['login_success'] });
    expect(received[0]).toMatchObject({ method: 'get', url: '/auditoria/filtros' });
  });
});
