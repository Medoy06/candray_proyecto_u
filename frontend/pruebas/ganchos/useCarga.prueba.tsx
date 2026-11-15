// =============================================================================
// useCarga.prueba.tsx
// Qué prueba:   el gancho que carga datos: estados loading/ready/error, que una
//               respuesta vieja no pise a una nueva, que se conserven los datos
//               anteriores mientras recarga, que un fallo quite los datos, y que
//               solo recargue cuando cambian las claves o se pide con reload().
// Cómo:         cada consulta se resuelve "a mano" desde la prueba.
// =============================================================================
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCarga } from '../../src/ganchos/useCarga';

// Un "servidor" que deja a la prueba decidir cuándo y cómo responde cada consulta.
function manual() {
  const pending: { resolve: (value: string) => void; reject: (error: unknown) => void }[] = [];
  const load = () =>
    new Promise<string>((resolve, reject) => {
      pending.push({ resolve, reject });
    });
  return { pending, load };
}

describe('useCarga', () => {
  it('arranca cargando y, al responder, queda listo con los datos', async () => {
    const { pending, load } = manual();
    const { result } = renderHook(() => useCarga(load, [], 'fallo'));
    expect(result.current).toMatchObject({ status: 'loading', data: null, error: null });
    await act(async () => pending[0].resolve('hola'));
    expect(result.current).toMatchObject({ status: 'ready', data: 'hola', error: null });
  });

  it('si falla, queda en error con el texto de respaldo y sin datos', async () => {
    const { pending, load } = manual();
    const { result } = renderHook(() => useCarga(load, [], 'No se pudo cargar.'));
    await act(async () => pending[0].reject(new Error('x')));
    expect(result.current).toMatchObject({ status: 'error', data: null, error: 'No se pudo cargar.' });
  });

  it('recarga al cambiar una clave y conserva los datos anteriores mientras tanto', async () => {
    const { pending, load } = manual();
    const { result, rerender } = renderHook(({ key }) => useCarga(load, [key], 'fallo'), { initialProps: { key: 'a' } });
    await act(async () => pending[0].resolve('uno'));
    rerender({ key: 'b' });
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(result.current).toMatchObject({ status: 'loading', data: 'uno' }); // no parpadea
    await act(async () => pending[1].resolve('dos'));
    expect(result.current).toMatchObject({ status: 'ready', data: 'dos' });
  });

  it('una respuesta vieja que llega tarde NO pisa a la más reciente', async () => {
    const { pending, load } = manual();
    const { result, rerender } = renderHook(({ key }) => useCarga(load, [key], 'fallo'), { initialProps: { key: 'a' } });
    rerender({ key: 'b' });
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[1].resolve('nueva'));
    await act(async () => pending[0].resolve('vieja'));
    expect(result.current.data).toBe('nueva');
  });

  it('un error viejo que llega tarde tampoco pisa a la más reciente', async () => {
    const { pending, load } = manual();
    const { result, rerender } = renderHook(({ key }) => useCarga(load, [key], 'fallo'), { initialProps: { key: 'a' } });
    rerender({ key: 'b' });
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[1].resolve('nueva'));
    await act(async () => pending[0].reject(new Error('tarde')));
    expect(result.current).toMatchObject({ status: 'ready', data: 'nueva', error: null });
  });

  it('un fallo al recargar quita los datos anteriores (no se muestra algo viejo junto al error)', async () => {
    const { pending, load } = manual();
    const { result } = renderHook(() => useCarga(load, [], 'fallo'));
    await act(async () => pending[0].resolve('uno'));
    act(() => result.current.reload());
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[1].reject(new Error('x')));
    expect(result.current).toMatchObject({ status: 'error', data: null });
  });

  it('reload() vuelve a pedir; un re-render sin cambios NO', async () => {
    const { pending, load } = manual();
    const { result, rerender } = renderHook(() => useCarga(load, [], 'fallo'));
    await act(async () => pending[0].resolve('uno'));
    rerender();
    rerender();
    expect(pending).toHaveLength(1);
    act(() => result.current.reload());
    await waitFor(() => expect(pending).toHaveLength(2));
  });
});
