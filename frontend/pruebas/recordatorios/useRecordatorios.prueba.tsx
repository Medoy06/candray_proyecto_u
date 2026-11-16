// =============================================================================
// useRecordatorios.prueba.tsx
// Qué prueba:   que el gancho vuelva a pedir los recordatorios cuando cambia la
//               sucursal activa (el servidor distingue la sucursal por la
//               cabecera, así que sin un nuevo pedido se vería la lista de la
//               sucursal anterior) y que no los pida de nuevo si no cambió.
// =============================================================================
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRecordatorios } from '../../src/ganchos/useRecordatorios';
import { installFakeApi } from '../ayudas/apiFalsa';

describe('useRecordatorios', () => {
  it('pide de nuevo al cambiar de sucursal, y no al repetir la misma', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [] } }));
    const { result, rerender } = renderHook(({ branch }) => useRecordatorios(branch), { initialProps: { branch: 'b1' } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(received).toHaveLength(1);

    rerender({ branch: 'b1' });
    expect(received).toHaveLength(1);

    rerender({ branch: 'b2' });
    await waitFor(() => expect(received).toHaveLength(2));
  });
});
