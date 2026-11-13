// =============================================================================
// errores.ts
// Qué hace:     define AppError (un error con código HTTP) y errorHandler, el
//               ÚNICO lugar que convierte cualquier error en una respuesta.
// Requerimiento: manejo único de errores (sección 4 del documento de diseño).
// Depende de:   nada.
// Lo usa:       app.ts (se monta al final) y cualquier código que lance AppError.
//
// Por qué un solo manejador: así ningún error filtra detalles internos (rutas
// de archivos, consultas SQL) y todos los errores tienen la misma forma:
//   { success: false, message: "..." }
// Express 5 envía automáticamente aquí los errores de funciones async, por lo
// que los controladores no necesitan try/catch.
// =============================================================================
import type { NextFunction, Request, Response } from 'express';

// Error esperado, con el código HTTP que debe recibir el cliente.
// Ejemplo:  throw new AppError('No existe esa cita.', 404);
export class AppError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Errores de PostgreSQL (por su código SQLSTATE) que son culpa de los datos
// enviados y no del servidor: se responden con 4xx en lugar de 500.
const DATABASE_ERRORS: Record<string, { status: number; message: string }> = {
  '23505': { status: 409, message: 'Ya existe un registro con esos datos.' },        // valor único repetido
  '23503': { status: 400, message: 'Referencia inválida en los datos enviados.' },    // clave foránea
  '22P02': { status: 400, message: 'Formato de dato inválido (ID o valor mal formado).' }, // ej.: uuid mal escrito
  '23502': { status: 400, message: 'Falta un campo requerido.' },                     // NOT NULL
  '23514': { status: 400, message: 'Un valor enviado no es válido.' },                // CHECK
  '22003': { status: 400, message: 'Un valor numérico está fuera del rango permitido.' },
  '23P01': { status: 409, message: 'El horario choca con otro registro existente.' }, // exclusión (RB-02)
};

// Convierte un error en la respuesta HTTP adecuada.
// Recibe: el error y los objetos de Express. Devuelve: nada (responde al cliente).
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  // Express identifica un manejador de errores por tener EXACTAMENTE 4
  // parámetros, aunque el último no se use.
  _next: NextFunction,
): void {
  const err = error as { message?: string; code?: string; type?: string; status?: number };
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message ?? error);

  if (error instanceof AppError) {
    res.status(error.statusCode).json({ success: false, message: error.message });
    return;
  }

  // El cuerpo de la petición no es JSON válido, o es más grande que el límite.
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, message: 'El cuerpo de la petición no es un JSON válido.' });
    return;
  }
  if (err.type === 'entity.too.large') {
    res.status(413).json({ success: false, message: 'La petición es demasiado grande.' });
    return;
  }

  const databaseError = err.code ? DATABASE_ERRORS[err.code] : undefined;
  if (databaseError) {
    res.status(databaseError.status).json({ success: false, message: databaseError.message });
    return;
  }

  // Cualquier otra cosa es un fallo nuestro: se responde un mensaje genérico
  // (el detalle queda solo en la consola del servidor).
  res.status(500).json({ success: false, message: 'Error interno del servidor.' });
}
