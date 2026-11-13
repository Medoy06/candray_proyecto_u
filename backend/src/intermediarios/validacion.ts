// =============================================================================
// validacion.ts
// Qué hace:     validate(esquema): comprueba el cuerpo de la petición con un
//               esquema Zod antes de que llegue al controlador.
//               validateQuery(esquema): lo mismo para los filtros de la URL
//               (?rol=doctor&...).
// Requerimiento: validación de entradas (sección 3, "Seguridad en el código").
// Depende de:   zod.
// Lo usan:      los archivos de rutas.
//
// Cosas que conviene saber:
//   - Zod ELIMINA los campos que el esquema no declara. Por eso el controlador
//     recibe solo lo permitido, aunque el cliente haya mandado de más.
//   - Si la validación pasa, req.body se REEMPLAZA por los datos ya limpios y
//     convertidos; el controlador debe usar req.body, no una copia anterior.
//   - En Express 5, req.query es de SOLO LECTURA: no se puede reemplazar como
//     req.body. Por eso validateQuery deja los filtros limpios en
//     res.locals.query y el controlador los lee de ahí.
//   - En las rutas, la autorización (can) va ANTES que validate: quien no tiene
//     permiso no debe enterarse de cómo es el formulario ni gastar validaciones.
// =============================================================================
import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

// Crea el intermediario de validación para un esquema.
// Recibe: el esquema Zod. Devuelve: el intermediario de Express.
// Responde 400 con la lista de campos inválidos si el cuerpo no cumple.
export function validate(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: 'Datos inválidos.',
        errors: result.error.errors.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    req.body = result.data;
    next();
  };
}

// Crea el intermediario de validación de los filtros de la URL (?a=1&b=2).
// Recibe: el esquema Zod. Devuelve: el intermediario de Express.
// Responde 400 si algún filtro es inválido; si no, guarda el resultado limpio
// en res.locals.query.
export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: 'Filtros inválidos.',
        errors: result.error.errors.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    res.locals.query = result.data;
    next();
  };
}
