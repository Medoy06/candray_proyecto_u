// =============================================================================
// apiFalsa.ts
// Qué hace:     reemplaza la red por respuestas preparadas por la prueba. Se
//               usa el cliente REAL (con sus interceptores de token, sucursal y
//               401), solo que en vez de salir a internet, responde la prueba.
// Lo usan:      las pruebas que llaman a la API.
// =============================================================================
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { api } from '../../src/servicios/clienteApi';

export interface FakeResponse {
  status: number;
  data?: unknown;
}

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

// Instala una API falsa.
// Recibe: una función que, dado el pedido, devuelve la respuesta (o lanza para
// simular que no hay conexión).
// Devuelve: la lista de pedidos recibidos, para comprobar qué se envió.
export function installFakeApi(
  respond: (request: RecordedRequest) => FakeResponse | Promise<FakeResponse>,
): RecordedRequest[] {
  const received: RecordedRequest[] = [];

  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const request: RecordedRequest = {
      method: (config.method ?? 'get').toLowerCase(),
      url: config.url ?? '',
      headers: Object.fromEntries(
        Object.entries(config.headers.toJSON()).map(([key, value]) => [key.toLowerCase(), String(value)]),
      ),
      body: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    };
    received.push(request);

    const { status, data = {} } = await respond(request);
    const response = { data, status, statusText: String(status), headers: {}, config, request: {} };
    if (status >= 200 && status < 300) return response;
    throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, {}, response);
  };

  api.defaults.adapter = adapter;
  return received;
}
