// =============================================================================
// registroErrores.prueba.ts
// Qué prueba:   que errorHandler escribe en la consola SOLO los fallos reales
//               (500) y no los rechazos esperados (400, 403, 404, 409...).
// Por qué:      si cada "usuario no encontrado" llenara la consola de [ERROR],
//               los errores de verdad pasarían desapercibidos.
// Depende de:   intermediarios/errores.ts.
// =============================================================================
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError, errorHandler } from '../../src/intermediarios/errores';

const app = express();
app.get('/rechazo', () => { throw new AppError('No existe.', 404); });
app.get('/duplicado', () => { throw Object.assign(new Error('dup'), { code: '23505' }); });
app.get('/falla', () => { throw new Error('se cayó algo'); });
app.get('/falla-app', () => { throw new AppError('Fallo interno.', 500); });
app.use(errorHandler);

afterEach(() => vi.restoreAllMocks());

describe('Registro de errores en la consola', () => {
  it.each(['/rechazo', '/duplicado'])('%s (rechazo esperado) no escribe en la consola', async (path) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await request(app).get(path);
    expect(spy).not.toHaveBeenCalled();
  });

  it.each(['/falla', '/falla-app'])('%s (fallo real) sí escribe en la consola', async (path) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await request(app).get(path);
    expect(response.status).toBe(500);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
